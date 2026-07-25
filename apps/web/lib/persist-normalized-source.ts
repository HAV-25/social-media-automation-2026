import {
  manualInputResultSchema,
  sourceAdapterNormalizedResultSchema,
} from "@content-engine/contracts";
import { sha256Hex } from "@content-engine/security";
import {
  classifyNormalizedSource,
  defaultSimilarityConfig,
  evaluateDuplicate,
  jaccardSimilarity,
  normalizeManualInput,
  scoreManualOpportunity,
} from "@content-engine/source-processing";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBrandConfiguration } from "./brand-configuration";
import {
  parseDemoContentRecords,
  serializeDemoContentRecords,
  type DemoContentRecord,
  uuidFromDeterministicHash,
} from "./demo-content-store";
import { createSupabaseServiceClient } from "./supabase/service";

type NormalizedSource = z.infer<typeof sourceAdapterNormalizedResultSchema>;
type PersistableSourceType = "rss" | "url" | "pdf" | "transcript" | "social_content" | "plain_text";

const rpcRowSchema = z.object({
  source_document_id: z.uuid(),
  opportunity_id: z.uuid(),
  generation_run_id: z.uuid(),
  duplicate: z.boolean(),
});

const candidateSchema = z.object({
  id: z.uuid(),
  canonical_url: z.string().nullable(),
  content_hash: z.string().regex(/^[0-9a-f]{64}$/),
  title: z.string().nullable(),
  clean_text: z.string().nullable(),
  cluster_sources: z
    .array(
      z.object({
        content_clusters: z
          .union([
            z.object({ cluster_key: z.string() }),
            z.array(z.object({ cluster_key: z.string() })),
          ])
          .nullable(),
      }),
    )
    .default([]),
});

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function persistNormalizedSource(input: {
  request: NextRequest;
  actorId: string;
  organizationId: string;
  brandId: string;
  idempotencyKey: string;
  sourceType: PersistableSourceType;
  sourceDocumentId?: string;
  contentHashOverride?: string;
  source: NormalizedSource;
  rawText?: string | null;
  rightsNotes?: string;
  storagePath?: string;
  scorePolicy?: {
    audienceDefinition: string;
    positioning: string;
    contentPillars: string[];
    restrictedTopics: string[];
  };
}) {
  const configuration = input.scorePolicy ? null : await getBrandConfiguration(input.brandId);
  if (!input.scorePolicy && !configuration) {
    return failure(404, "brand_not_found", "Brand not found or not assigned.");
  }
  if (input.source.cleanText.length < 20) {
    return failure(422, "content_too_short", "Extracted input must contain 20 characters.");
  }
  const normalized = normalizeManualInput({
    title: input.source.title,
    text: input.source.cleanText,
    language: input.source.language,
  });
  const persistedContentHash = input.contentHashOverride ?? normalized.contentHash;
  const scorePolicy = input.scorePolicy ?? {
    audienceDefinition: configuration!.profile.audienceDefinition,
    positioning: configuration!.profile.positioning,
    contentPillars: configuration!.profile.contentPillars,
    restrictedTopics: configuration!.profile.restrictedTopics,
  };
  const scoreBreakdown = scoreManualOpportunity({
    cleanText: normalized.cleanText,
    policy: scorePolicy,
  });
  const classification = classifyNormalizedSource({
    cleanText: normalized.cleanText,
    policy: scorePolicy,
  });
  const requestHash = sha256Hex(
    JSON.stringify({
      brandId: input.brandId,
      sourceType: input.sourceType,
      contentHash: persistedContentHash,
      canonicalUrl: input.source.canonicalUrl,
      storagePath: input.storagePath,
    }),
  );

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const records = parseDemoContentRecords(
      input.request.cookies.get("demo-content-records")?.value,
    );
    const existing = records.find(
      (record) => record.contentHash === persistedContentHash && record.brandId === input.brandId,
    );
    const identity = sha256Hex(`${input.brandId}:${persistedContentHash}`);
    const result = manualInputResultSchema.parse({
      contractVersion: "1.0",
      sourceDocumentId:
        existing?.sourceDocumentId ?? uuidFromDeterministicHash(persistedContentHash),
      opportunityId: existing?.opportunityId ?? uuidFromDeterministicHash(identity),
      generationRunId: uuidFromDeterministicHash(sha256Hex(input.idempotencyKey)),
      duplicate: Boolean(existing),
      score: existing?.score ?? scoreBreakdown.finalScore,
      riskPenalty: existing?.riskPenalty ?? scoreBreakdown.riskPenalty,
      status: "analyzed",
    });
    const record: DemoContentRecord = {
      contentHash: persistedContentHash,
      sourceDocumentId: result.sourceDocumentId,
      opportunityId: result.opportunityId,
      generationRunId: result.generationRunId,
      brandId: input.brandId,
      sourceType: input.sourceType,
      title: normalized.title,
      cleanText: normalized.cleanText,
      language: normalized.language,
      canonicalUrl: input.source.canonicalUrl,
      nucleus: normalized.valueNucleus,
      namedEntities: classification.namedEntities,
      topicTags: classification.topicTags,
      recommendedStyle: classification.recommendedStyle,
      classificationReasons: classification.reasons,
      score: result.score,
      riskPenalty: result.riskPenalty,
      dimensions: Object.entries(scoreBreakdown.dimensions).map(([key, dimension]) => ({
        key,
        score: dimension.score,
        maximum: dimension.maximum,
      })),
      riskReasons: scoreBreakdown.riskReasons.slice(0, 5),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    const response = NextResponse.json(result, { status: existing ? 200 : 201 });
    response.cookies.set(
      "demo-content-records",
      serializeDemoContentRecords([record, ...records.filter((item) => item !== existing)]),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 8,
      },
    );
    return response;
  }

  const supabase = createSupabaseServiceClient();
  const { data: candidateRows, error: candidateError } = await supabase
    .from("source_documents")
    .select(
      "id,canonical_url,content_hash,title,clean_text,cluster_sources(content_clusters(cluster_key))",
    )
    .eq("organization_id", input.organizationId)
    .not("content_hash", "is", null)
    .not("clean_text", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (candidateError) {
    return failure(500, "deduplication_lookup_failed", "Existing sources could not be compared.");
  }
  const candidates = z.array(candidateSchema).parse(candidateRows ?? []);
  const comparable = {
    id: persistedContentHash,
    canonicalUrl: input.source.canonicalUrl,
    contentHash: persistedContentHash,
    title: normalized.title,
    cleanText: normalized.cleanText,
  };
  const comparisons = candidates.map((candidate) => {
    const existing = {
      id: candidate.id,
      canonicalUrl: candidate.canonical_url ?? undefined,
      contentHash: candidate.content_hash,
      title: candidate.title ?? "",
      cleanText: candidate.clean_text ?? "",
    };
    const duplicate = evaluateDuplicate(comparable, existing);
    const titleSimilarity = jaccardSimilarity(comparable.title, existing.title, 1);
    const textSimilarity = jaccardSimilarity(comparable.cleanText, existing.cleanText, 1);
    return {
      candidate,
      duplicate,
      clusterSimilarity: titleSimilarity * 0.4 + textSimilarity * 0.6,
    };
  });
  const nearDuplicate = comparisons
    .filter((comparison) => comparison.duplicate.kind === "near_duplicate")
    .sort(
      (left, right) =>
        right.duplicate.textSimilarity - left.duplicate.textSimilarity ||
        left.candidate.id.localeCompare(right.candidate.id),
    )[0];
  const hasExactMatch = comparisons.some((comparison) =>
    ["exact_hash", "exact_url"].includes(comparison.duplicate.kind),
  );
  const clusterMatches = hasExactMatch
    ? []
    : comparisons
        .filter(
          (comparison) => comparison.clusterSimilarity >= defaultSimilarityConfig.clusterThreshold,
        )
        .sort((left, right) => left.candidate.id.localeCompare(right.candidate.id));
  const existingClusterKey = clusterMatches
    .flatMap((match) => match.candidate.cluster_sources)
    .flatMap((link) =>
      Array.isArray(link.content_clusters)
        ? link.content_clusters
        : link.content_clusters
          ? [link.content_clusters]
          : [],
    )[0]?.cluster_key;
  const clusterKey =
    existingClusterKey ??
    (clusterMatches.length
      ? sha256Hex(
          [persistedContentHash, ...clusterMatches.map((match) => match.candidate.content_hash)]
            .sort()
            .join(":"),
        )
      : undefined);
  const { data, error } = await supabase
    .rpc("ingest_manual_input", {
      payload: {
        contractVersion: "1.0",
        idempotencyKey: input.idempotencyKey,
        actorId: input.actorId,
        brandId: input.brandId,
        sourceDocumentId: input.sourceDocumentId,
        sourceType: input.sourceType,
        title: normalized.title,
        rawText: input.rawText,
        cleanText: normalized.cleanText,
        contentHash: persistedContentHash,
        language: normalized.language,
        canonicalUrl: input.source.canonicalUrl,
        author: input.source.provenance.author,
        publisher: input.source.provenance.publisher,
        publishedAt: input.source.provenance.publishedAt,
        rightsNotes: input.rightsNotes,
        storagePath: input.storagePath,
        sections: input.source.sections,
        requiresManualReview: input.source.requiresManualReview,
        reviewReasons: input.source.reviewReasons,
        extractionConfidence: input.source.requiresManualReview ? 0.5 : 1,
        duplicateOfSourceId: nearDuplicate?.candidate.id,
        duplicateSimilarity: nearDuplicate?.duplicate.textSimilarity,
        clusterKey,
        clusterSources: clusterMatches.map((match) => ({
          sourceDocumentId: match.candidate.id,
          similarity: Math.round(match.clusterSimilarity * 100_000) / 100_000,
          relationshipType:
            match.candidate.id === nearDuplicate?.candidate.id ? "duplicate" : "related",
        })),
        valueNucleus: normalized.valueNucleus,
        namedEntities: classification.namedEntities,
        topicTags: classification.topicTags,
        recommendedStyle: classification.recommendedStyle,
        classificationReasons: classification.reasons,
        score: scoreBreakdown.finalScore,
        riskPenalty: scoreBreakdown.riskPenalty,
        scoreBreakdown,
        requestHash,
      },
    })
    .single();
  if (error) {
    return failure(
      error.code === "23505" ? 409 : 500,
      error.code === "23505" ? "idempotency_conflict" : "input_persistence_failed",
      error.code === "23505"
        ? "This idempotency key was already used for another request."
        : "The normalized source could not be persisted.",
    );
  }
  const row = rpcRowSchema.parse(data);
  return NextResponse.json(
    manualInputResultSchema.parse({
      contractVersion: "1.0",
      sourceDocumentId: row.source_document_id,
      opportunityId: row.opportunity_id,
      generationRunId: row.generation_run_id,
      duplicate: row.duplicate,
      score: scoreBreakdown.finalScore,
      riskPenalty: scoreBreakdown.riskPenalty,
      status: "analyzed",
    }),
    { status: row.duplicate ? 200 : 201 },
  );
}
