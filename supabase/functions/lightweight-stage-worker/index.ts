import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.53.0";
import { z } from "npm:zod@4.0.17";
import { composeBrandedImage } from "../_shared/image-runtime.ts";
import {
  canonicalCitationUrl,
  generateBaseImage,
  structuredResponse,
} from "../_shared/openai-runtime.ts";
import {
  LIGHTWEIGHT_IMAGE_PROMPT_VERSION,
  LIGHTWEIGHT_IMAGE_SYSTEM_PROMPT,
  LIGHTWEIGHT_RESEARCH_PROMPT_VERSION,
  LIGHTWEIGHT_RESEARCH_SYSTEM_PROMPT,
  LIGHTWEIGHT_WRITER_PROMPT_VERSION,
  LIGHTWEIGHT_WRITER_SYSTEM_PROMPT,
} from "../_shared/prompts/lightweight-runtime.v1.ts";
import {
  jsonResponse,
  requireWorkerSecret,
  safeErrorResponse,
  WorkerHttpError,
} from "../_shared/worker-auth.ts";

const stageSchema = z.enum(["research", "draft", "verify", "image", "package"]);
const styles = [
  "newsworthy_authority",
  "educational_breakdown",
  "perspective_conversation",
] as const;
const contentStyleSchema = z.enum(styles);
const requestSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    stages: z.array(stageSchema).min(1).max(5),
    limit: z.number().int().min(1).max(10).default(3),
    workerId: z.string().min(3).max(120),
  })
  .strict();
const jobSchema = z.object({
  job_id: z.uuid(),
  pipeline_id: z.uuid(),
  organization_id: z.uuid(),
  brand_id: z.uuid(),
  stage: stageSchema,
  attempt: z.number().int(),
  idempotency_key: z.string(),
  request_payload: z.record(z.string(), z.unknown()),
});

const researchResultSchema = z
  .object({
    summary: z.string().min(20).max(5000),
    sources: z
      .array(
        z
          .object({
            sourceKey: z.string().regex(/^source_[a-z0-9]{6,40}$/),
            url: z.url().refine((value) => value.startsWith("https://")),
            title: z.string().min(3).max(500),
            publisher: z.string().min(1).max(200),
            sourceType: z.enum(["primary_document", "credible_reporting", "source_material"]),
            authorityScore: z.number().min(0).max(100),
            relevantExcerpt: z.string().min(3).max(2000),
          })
          .strict(),
      )
      .max(6),
    claims: z
      .array(
        z
          .object({
            text: z.string().min(3).max(2000),
            claimType: z.enum(["factual", "numerical", "opinion", "interpretation"]),
            importance: z.enum(["core", "supporting", "optional"]),
            riskLevel: z.enum(["low", "medium", "high"]),
            verificationState: z.enum([
              "verified",
              "partially_supported",
              "disputed",
              "unsupported",
              "opinion",
            ]),
            confidence: z.number().min(0).max(1),
            usageGuidance: z.enum(["safe", "caveat", "do_not_use"]),
            caveat: z.string().max(1000),
            evidence: z
              .array(
                z
                  .object({
                    sourceKey: z.string().regex(/^source_[a-z0-9]{6,40}$/),
                    supportType: z.enum(["supports", "contradicts", "context"]),
                    excerpt: z.string().min(3).max(1500),
                    locator: z.string().min(1).max(1000),
                  })
                  .strict(),
              )
              .min(1)
              .max(6),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    caveats: z.array(z.string().min(3).max(1000)).max(10),
  })
  .strict();

const draftResultSchema = z
  .object({
    angles: z
      .array(
        z
          .object({
            title: z.string().min(3).max(200),
            thesis: z.string().min(20).max(1500),
            intendedReaction: z.string().min(3).max(500),
            score: z.number().min(0).max(100),
          })
          .strict(),
      )
      .length(3),
    selectedAngleIndex: z.number().int().min(0).max(2),
    hook: z.string().min(1).max(500),
    body: z.string().min(1).max(8000),
    closing: z.string().max(1000),
  })
  .strict();
const draftSetResultSchema = z
  .object({
    drafts: z
      .array(draftResultSchema.extend({ contentStyle: contentStyleSchema }))
      .min(1)
      .max(3),
  })
  .strict()
  .superRefine((value, context) => {
    const returned = value.drafts.map((draft) => draft.contentStyle);
    if (new Set(returned).size !== returned.length) {
      context.addIssue({
        code: "custom",
        path: ["drafts"],
        message: "Draft styles must be unique.",
      });
    }
  });

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const string = (extra: Record<string, unknown> = {}) => ({ type: "string", ...extra });
const researchJsonSchema = object({
  summary: string(),
  sources: {
    type: "array",
    maxItems: 6,
    items: object({
      sourceKey: string({ pattern: "^source_[a-z0-9]{6,40}$" }),
      url: string({ pattern: "^https://" }),
      title: string(),
      publisher: string(),
      sourceType: {
        type: "string",
        enum: ["primary_document", "credible_reporting", "source_material"],
      },
      authorityScore: { type: "number", minimum: 0, maximum: 100 },
      relevantExcerpt: string(),
    }),
  },
  claims: {
    type: "array",
    minItems: 1,
    maxItems: 8,
    items: object({
      text: string(),
      claimType: { type: "string", enum: ["factual", "numerical", "opinion", "interpretation"] },
      importance: { type: "string", enum: ["core", "supporting", "optional"] },
      riskLevel: { type: "string", enum: ["low", "medium", "high"] },
      verificationState: {
        type: "string",
        enum: ["verified", "partially_supported", "disputed", "unsupported", "opinion"],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      usageGuidance: { type: "string", enum: ["safe", "caveat", "do_not_use"] },
      caveat: string(),
      evidence: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: object({
          sourceKey: string({ pattern: "^source_[a-z0-9]{6,40}$" }),
          supportType: { type: "string", enum: ["supports", "contradicts", "context"] },
          excerpt: string(),
          locator: string(),
        }),
      },
    }),
  },
  caveats: { type: "array", maxItems: 10, items: string() },
});
const draftJsonSchema = object({
  angles: {
    type: "array",
    minItems: 3,
    maxItems: 3,
    items: object({
      title: string(),
      thesis: string(),
      intendedReaction: string(),
      score: { type: "number", minimum: 0, maximum: 100 },
    }),
  },
  selectedAngleIndex: { type: "integer", minimum: 0, maximum: 2 },
  hook: string(),
  body: string(),
  closing: string(),
});
const draftSetJsonSchema = (requestedStyles: readonly (typeof styles)[number][]) =>
  object({
    drafts: {
      type: "array",
      minItems: requestedStyles.length,
      maxItems: requestedStyles.length,
      items: object({
        contentStyle: { type: "string", enum: requestedStyles },
        angles: draftJsonSchema.properties.angles,
        selectedAngleIndex: draftJsonSchema.properties.selectedAngleIndex,
        hook: draftJsonSchema.properties.hook,
        body: draftJsonSchema.properties.body,
        closing: draftJsonSchema.properties.closing,
      }),
    },
  });

type Client = SupabaseClient;
type Job = z.infer<typeof jobSchema>;

const providerOperationSchema = z
  .object({
    state: z.enum(["started", "succeeded", "ambiguous"]),
    execute: z.boolean(),
    result: z.record(z.string(), z.unknown()).optional(),
    model: z.string().optional(),
    responseId: z.string().optional(),
    usage: z.record(z.string(), z.unknown()).optional(),
    costUsd: z.coerce.number().min(0).optional(),
  })
  .passthrough();
const openAIUsageSchema = z
  .object({
    inputTokens: z.coerce.number().min(0),
    outputTokens: z.coerce.number().min(0),
    webSearchCalls: z.coerce.number().min(0),
    estimatedCostUsd: z.coerce.number().min(0),
  })
  .passthrough();
const structuredProviderResultSchema = z
  .object({
    data: z.unknown(),
    responseId: z.string().min(1),
    model: z.string().min(1),
    usage: openAIUsageSchema,
    citations: z.array(z.object({ url: z.string(), title: z.string() })).default([]),
  })
  .strict();
const imageProviderResultSchema = z
  .object({
    basePath: z.string().min(1),
    responseId: z.string().min(1),
    model: z.string().min(1),
    costUsd: z.coerce.number().min(0),
    usage: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

function oneRow(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

async function beginProviderOperation(
  client: Client,
  job: Job,
  workerId: string,
  operationKey: string,
) {
  const response = await client.rpc("begin_provider_operation", {
    payload: { jobId: job.job_id, workerId, operationKey },
  });
  if (response.error) throw response.error;
  const operation = providerOperationSchema.parse(oneRow(response.data));
  if (operation.state === "ambiguous" || (!operation.execute && operation.state !== "succeeded")) {
    throw new WorkerHttpError(
      409,
      "provider_operation_ambiguous",
      "A previous provider operation has an unknown outcome and will not be repeated automatically.",
    );
  }
  return operation;
}

async function completeProviderOperation(
  client: Client,
  job: Job,
  workerId: string,
  operationKey: string,
  result: Record<string, unknown>,
  metadata: { model: string; responseId: string; usage: Record<string, unknown>; costUsd: number },
) {
  const response = await client.rpc("complete_provider_operation", {
    payload: {
      jobId: job.job_id,
      workerId,
      operationKey,
      result,
      model: metadata.model,
      responseId: metadata.responseId,
      usage: metadata.usage,
      costUsd: metadata.costUsd,
    },
  });
  if (response.error) throw response.error;
}

function providerRetryIsSafe(error: unknown) {
  return (
    error instanceof WorkerHttpError &&
    ["provider_rate_limited", "provider_request_failed", "image_provider_failed"].includes(
      error.code,
    )
  );
}

async function failProviderOperation(
  client: Client,
  job: Job,
  workerId: string,
  operationKey: string,
  error: unknown,
) {
  const safe = sanitizeError(error);
  const response = await client.rpc("fail_provider_operation", {
    payload: {
      jobId: job.job_id,
      workerId,
      operationKey,
      retrySafe: providerRetryIsSafe(error),
      code: safe.code,
    },
  });
  if (response.error) throw response.error;
}

async function deterministicUuid(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  ).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function environmentClient(): Client {
  const url = Deno.env.get("SUPABASE_URL");
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
  if (!key) {
    try {
      const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<
        string,
        string
      >;
      key = keys.default ?? Object.values(keys)[0] ?? "";
    } catch {
      key = "";
    }
  }
  if (!url || !key)
    throw new WorkerHttpError(
      500,
      "supabase_environment_missing",
      "Worker database environment is unavailable.",
    );
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function digestHex(value: string | Uint8Array): Promise<string> {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : Uint8Array.from(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sanitizeError(error: unknown) {
  if (error instanceof WorkerHttpError) {
    const retryableCodes = new Set([
      "provider_rate_limited",
      "provider_request_failed",
      "image_provider_failed",
    ]);
    return {
      code: error.code,
      summary: error.message.slice(0, 500),
      retryable: retryableCodes.has(error.code),
      category: retryableCodes.has(error.code) ? "provider" : "validation",
    };
  }
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const databaseCode = typeof record.code === "string" ? record.code : "";
  const retryableDatabaseError = /^(08|53|57P0)|^(40001|40P01)$/.test(databaseCode);
  return {
    code: databaseCode || "stage_execution_failed",
    summary: retryableDatabaseError
      ? "A transient database operation failed safely."
      : "The stage failed a deterministic database or validation boundary.",
    retryable: retryableDatabaseError,
    category: retryableDatabaseError ? "transient" : "validation",
  };
}

async function loadContext(client: Client, job: Job) {
  const pipeline = await client
    .from("pipeline_instances")
    .select("opportunity_id,source_document_id,correlation_id")
    .eq("id", job.pipeline_id)
    .single();
  if (pipeline.error || !pipeline.data?.opportunity_id)
    throw pipeline.error ?? new Error("Pipeline context missing");
  const opportunity = await client
    .from("opportunities")
    .select(
      "id,value_nucleus,opportunity_score,recommended_style,source_documents(title,canonical_url,clean_text,metadata)",
    )
    .eq("id", pipeline.data.opportunity_id)
    .single();
  if (opportunity.error) throw opportunity.error;
  const brand = await client
    .from("brands")
    .select(
      "id,name,brand_profiles(audience_definition,positioning,content_pillars,restricted_topics,voice_traits,visual_system)",
    )
    .eq("id", job.brand_id)
    .single();
  if (brand.error) throw brand.error;
  return {
    pipeline: pipeline.data,
    opportunity: opportunity.data as Record<string, unknown>,
    brand: brand.data as Record<string, unknown>,
  };
}

function relation(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return (value[0] ?? {}) as Record<string, unknown>;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

const stopWords = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "because",
  "been",
  "before",
  "being",
  "between",
  "but",
  "can",
  "could",
  "for",
  "from",
  "has",
  "have",
  "into",
  "its",
  "more",
  "not",
  "our",
  "than",
  "that",
  "the",
  "their",
  "there",
  "these",
  "they",
  "this",
  "through",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "will",
  "with",
  "would",
  "your",
]);

function tokenSet(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !stopWords.has(token)),
  );
}

function similarity(left: string, right: string) {
  const first = tokenSet(left);
  const second = tokenSet(right);
  if (!first.size || !second.size) return 0;
  let intersection = 0;
  for (const token of first) if (second.has(token)) intersection += 1;
  return intersection / (first.size + second.size - intersection);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function evaluateDraft(input: {
  draftId?: string;
  hook: string;
  body: string;
  closing: string;
  sourceText: string;
  evidencePackage: Record<string, unknown>;
  profile: Record<string, unknown>;
  priorPosts: string[];
}) {
  const fullText = [input.hook, input.body, input.closing].filter(Boolean).join("\n\n");
  const claims = Array.isArray(input.evidencePackage.claims)
    ? (input.evidencePackage.claims as Array<Record<string, unknown>>)
    : [];
  const sentences = fullText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 10);
  const sentenceClaims = sentences.map((sentence) => {
    const ranked = claims
      .map((claim) => ({
        claimKey: String(claim.claimKey ?? ""),
        score: similarity(sentence, String(claim.text ?? "")),
        verificationState: String(claim.verificationState ?? "unverified"),
        usageGuidance: String(claim.usageGuidance ?? "caveat"),
        supportTypes: Array.isArray(claim.evidence)
          ? (claim.evidence as Array<Record<string, unknown>>).map((item) =>
              String(item.supportType ?? ""),
            )
          : [],
      }))
      .sort((left, right) => right.score - left.score);
    const match = ranked[0];
    return {
      sentence,
      claimKey: match && match.score >= 0.16 ? match.claimKey : null,
      similarity: Math.round((match?.score ?? 0) * 1000) / 1000,
      verificationState: match && match.score >= 0.16 ? match.verificationState : "unmapped",
      usageGuidance: match && match.score >= 0.16 ? match.usageGuidance : "caveat",
      supportTypes: match && match.score >= 0.16 ? match.supportTypes : [],
    };
  });
  const mapped = sentenceClaims.filter((item) => item.claimKey);
  const supported = mapped.filter(
    (item) =>
      item.usageGuidance !== "do_not_use" &&
      ["verified", "partially_supported", "opinion"].includes(item.verificationState),
  );
  const evidenceScore = Math.round(
    Math.min(100, 45 + (sentences.length ? (supported.length / sentences.length) * 55 : 0)),
  );
  const brandTerms = [
    String(input.profile.positioning ?? ""),
    String(input.profile.audience_definition ?? ""),
    ...stringArray(input.profile.content_pillars),
  ].join(" ");
  const brandOverlap = similarity(fullText, brandTerms);
  const brandFitScore = Math.round(Math.min(100, 55 + brandOverlap * 180));
  const structural =
    (input.hook.length >= 15 && input.hook.length <= 280 ? 25 : 12) +
    (input.body.length >= 180 && input.body.length <= 5000 ? 45 : 25) +
    (input.closing.length >= 10 && input.closing.length <= 500 ? 20 : 10) +
    (sentences.length >= 3 && sentences.length <= 24 ? 10 : 5);
  const sourceSimilarity = similarity(fullText, input.sourceText);
  const sameBrandSimilarity = input.priorPosts.reduce(
    (maximum, post) => Math.max(maximum, similarity(fullText, post)),
    0,
  );
  const prohibitedPhrases = [
    "guaranteed",
    "go viral",
    "will revolutionize",
    "game-changing",
  ].filter((phrase) => fullText.toLowerCase().includes(phrase));
  const restrictedTopics = stringArray(input.profile.restricted_topics).filter((topic) =>
    fullText.toLowerCase().includes(topic.toLowerCase()),
  );
  const cliches = ["in today's fast-paced world", "paradigm shift", "the future is here"].filter(
    (phrase) => fullText.toLowerCase().includes(phrase),
  );
  const unsupportedHighRiskClaims = sentenceClaims.filter(
    (item) =>
      !item.claimKey &&
      (/\b\d+(?:\.\d+)?%?\b/.test(item.sentence) ||
        /\b(always|never|proves?|guarantees?|first|only|best)\b/i.test(item.sentence)),
  ).length;
  const unsafeMappedClaims = sentenceClaims.filter(
    (item) =>
      item.claimKey &&
      (item.usageGuidance === "do_not_use" ||
        ["unsupported", "disputed"].includes(item.verificationState) ||
        (item.supportTypes.includes("contradicts") && !item.supportTypes.includes("supports"))),
  );
  const contradictions = unsafeMappedClaims.filter((item) =>
    item.supportTypes.includes("contradicts"),
  ).length;
  const warnings = [
    ...(evidenceScore < 70 ? ["Evidence mapping is below 70."] : []),
    ...(brandFitScore < 70 ? ["Brand fit is below 70."] : []),
    ...(sourceSimilarity > 0.55 ? ["Draft is too similar to the source wording."] : []),
    ...(sameBrandSimilarity > 0.7 ? ["Draft is too similar to a recent brand post."] : []),
    ...(unsupportedHighRiskClaims
      ? [`${unsupportedHighRiskClaims} high-risk sentence(s) lack a claim mapping.`]
      : []),
    ...unsafeMappedClaims.map(
      (item) =>
        `A sentence maps to claim ${item.claimKey} which is ${item.usageGuidance === "do_not_use" ? "marked do not use" : item.verificationState}.`,
    ),
    ...prohibitedPhrases.map((phrase) => `Prohibited certainty or hype phrase: ${phrase}.`),
    ...restrictedTopics.map((topic) => `Restricted topic requires attention: ${topic}.`),
    ...cliches.map((phrase) => `Cliche requires attention: ${phrase}.`),
  ];
  const qualityScore = Math.max(0, Math.min(100, structural - warnings.length * 3));
  return {
    postDraftId: input.draftId,
    contractVersion: "1.0",
    evidenceScore,
    brandFitScore,
    qualityScore,
    sourceSimilarity: Math.round(sourceSimilarity * 1000) / 1000,
    sameBrandSimilarity: Math.round(sameBrandSimilarity * 1000) / 1000,
    crossBrandSimilarity: 0,
    hookReuseSimilarity: 0,
    unsupportedHighRiskClaims,
    contradictions,
    prohibitedPhrases,
    restrictedTopics,
    cliches,
    warnings,
    sentenceClaims,
    readyForReview: true,
  };
}

async function persist(
  client: Client,
  job: Job,
  workerId: string,
  actorId: string,
  result: {
    output: Record<string, unknown>;
    usage: Record<string, unknown>;
    costUsd: number;
    nextStage: z.infer<typeof stageSchema> | null;
    nextRequest: Record<string, unknown>;
  },
) {
  const saved = await client.rpc("persist_lightweight_stage_output", {
    payload: {
      pipelineId: job.pipeline_id,
      jobId: job.job_id,
      workerId,
      stage: job.stage,
      actorId,
      output: result.output,
      usage: result.usage,
      costUsd: result.costUsd,
      nextStage: result.nextStage,
      nextRequest: result.nextRequest,
    },
  });
  if (saved.error) throw saved.error;
  return saved.data as Record<string, unknown>;
}

async function researchStage(
  client: Client,
  job: Job,
  context: Awaited<ReturnType<typeof loadContext>>,
  actorId: string,
  workerId: string,
) {
  const source = relation(context.opportunity.source_documents);
  const title = String(source.title ?? "Untitled source");
  const cleanText = String(source.clean_text ?? "").slice(0, 80_000);
  const canonicalUrl = String(source.canonical_url ?? "https://example.invalid/source");
  const operationKey = `${job.idempotency_key}:openai-research`;
  const operation = await beginProviderOperation(client, job, workerId, operationKey);
  let response: z.infer<typeof structuredProviderResultSchema>;
  if (operation.state === "succeeded") {
    response = structuredProviderResultSchema.parse(operation.result);
  } else {
    try {
      const generated = await structuredResponse<unknown>({
        instructions: LIGHTWEIGHT_RESEARCH_SYSTEM_PROMPT,
        prompt: `Research this source within a maximum of two search actions.\nTITLE: ${title}\nORIGINAL_URL: ${canonicalUrl}\nSOURCE_TEXT:\n${cleanText}\nReturn only sources actually opened by web search. Use source_original for the supplied article and source_<stable lowercase key> for external sources. Every claim must contain evidence entries that reference one returned source key. Do not infer or invent a URL, quote, locator, or publisher.`,
        format: { name: "lightweight_research", schema: researchJsonSchema },
        maxOutputTokens: 3000,
        webSearch: true,
        maxToolCalls: 2,
        idempotencyKey: operationKey,
      });
      response = structuredProviderResultSchema.parse(generated);
      await completeProviderOperation(client, job, workerId, operationKey, response, {
        model: response.model,
        responseId: response.responseId,
        usage: response.usage,
        costUsd: response.usage.estimatedCostUsd,
      });
    } catch (error) {
      await failProviderOperation(client, job, workerId, operationKey, error);
      throw error;
    }
  }
  const research = researchResultSchema.parse(response.data);
  const retrievedAt = new Date().toISOString();
  const sourceKey = "source_original";
  const citationUrls = new Set(
    response.citations.map((citation) => canonicalCitationUrl(citation.url)).filter(Boolean),
  );
  const externalSources = research.sources
    .filter((item) => item.sourceKey !== sourceKey)
    .map((item) => ({ ...item, url: canonicalCitationUrl(item.url) ?? item.url }));
  if (new Set(externalSources.map((item) => item.sourceKey)).size !== externalSources.length) {
    throw new WorkerHttpError(
      422,
      "research_source_key_duplicate",
      "Research source keys must be unique.",
    );
  }
  for (const item of externalSources) {
    if (!citationUrls.has(item.url)) {
      throw new WorkerHttpError(
        502,
        "research_source_not_observed",
        "The model returned an external source that was not present in provider citations.",
      );
    }
  }
  const sources = [
    {
      sourceKey,
      url: canonicalUrl,
      title,
      publisher: new URL(canonicalUrl).hostname,
      publishedAt: null,
      retrievedAt,
      sourceType: "source_material",
      authorityScore: 70,
      relevantExcerpt: cleanText.slice(0, 2000) || title,
    },
    ...externalSources.map((item) => ({
      ...item,
      publishedAt: null,
      retrievedAt,
    })),
  ];
  const sourceKeys = new Set(sources.map((item) => item.sourceKey));
  const researchWarnings: string[] = [];
  const normalizedClaims = research.claims.map((claim, index) => {
    if (claim.evidence.some((evidence) => !sourceKeys.has(evidence.sourceKey))) {
      throw new WorkerHttpError(
        502,
        "research_evidence_reference_invalid",
        "A claim references evidence outside the bounded source set.",
      );
    }
    const supports = claim.evidence.some((evidence) => evidence.supportType === "supports");
    const contradicts = claim.evidence.some((evidence) => evidence.supportType === "contradicts");
    const needsSupport =
      ["factual", "numerical"].includes(claim.claimType) &&
      ["verified", "partially_supported"].includes(claim.verificationState);
    if (needsSupport && !supports) {
      researchWarnings.push(
        `Claim ${index + 1} was downgraded because no supporting evidence was returned.`,
      );
      return {
        ...claim,
        verificationState: contradicts ? ("disputed" as const) : ("unsupported" as const),
        usageGuidance:
          claim.riskLevel === "high" || contradicts ? ("do_not_use" as const) : ("caveat" as const),
        caveat: [
          claim.caveat,
          "No supporting evidence was returned for the claimed verification state.",
        ]
          .filter(Boolean)
          .join(" "),
      };
    }
    return claim;
  });
  const usableClaims = normalizedClaims.filter(
    (claim) =>
      claim.usageGuidance !== "do_not_use" &&
      !["unsupported", "disputed"].includes(claim.verificationState),
  );
  const readyForWriting = usableClaims.length > 0;
  const evidencePackage = {
    contractVersion: "1.0",
    opportunityId: String(context.opportunity.id),
    summary: research.summary,
    sources,
    claims: normalizedClaims.map((claim, index) => ({
      claimKey: `claim_${String(index + 1).padStart(6, "0")}`,
      ...claim,
      caveat: claim.caveat || null,
      evidence: claim.evidence,
    })),
    conflicts: [],
    caveats: [...research.caveats, ...researchWarnings],
    warnings: researchWarnings,
    readyForWriting,
  };
  if (!readyForWriting) {
    throw new WorkerHttpError(
      422,
      "research_has_no_usable_claims",
      "Research returned no claim safe enough for writing.",
    );
  }
  const plan = {
    contractVersion: "1.0",
    opportunityId: String(context.opportunity.id),
    objective: `Verify the central claims in ${title}`,
    queries: [
      { query: title.slice(0, 300), purpose: "Verify central claims", priority: "required" },
    ],
    preferredSourceTypes: ["primary_document", "credible_reporting"],
    allowedDomains: [],
    excludedContext: [],
    budget: {
      maxQueries: 2,
      maxDomains: 10,
      maxResults: 6,
      maxElapsedMs: 120000,
      maxOutputTokens: 3000,
      maxCostUsd: 0.25,
    },
  };
  const output = {
    plan,
    evidencePackage,
    model: response.model,
    promptVersion: LIGHTWEIGHT_RESEARCH_PROMPT_VERSION,
    responseId: response.responseId,
    usage: response.usage,
  };
  return {
    output,
    usage: response.usage,
    costUsd: response.usage.estimatedCostUsd,
    nextStage: "draft" as const,
    nextRequest: { actorId, opportunityId: context.opportunity.id },
  };
}

async function draftStage(
  client: Client,
  job: Job,
  context: Awaited<ReturnType<typeof loadContext>>,
  actorId: string,
  workerId: string,
) {
  const source = relation(context.opportunity.source_documents);
  const profile = relation(context.brand.brand_profiles);
  const research = await client
    .from("research_runs")
    .select("evidence_package")
    .eq("opportunity_id", String(context.opportunity.id))
    .eq("status", "succeeded")
    .order("completed_at", { ascending: false })
    .limit(1)
    .single();
  if (research.error) throw research.error;
  const previous = await client
    .from("post_drafts")
    .select("post_versions!post_drafts_current_version_fk(full_text)")
    .eq("brand_id", job.brand_id)
    .neq("opportunity_id", String(context.opportunity.id))
    .order("updated_at", { ascending: false })
    .limit(50);
  if (previous.error) throw previous.error;
  const priorPosts = (previous.data ?? [])
    .map((item) => String(relation(item.post_versions).full_text ?? ""))
    .filter(Boolean);
  const requestedDraftId =
    typeof job.request_payload.postDraftId === "string"
      ? job.request_payload.postDraftId
      : undefined;
  let requestedStyles: readonly (typeof styles)[number][] = styles;
  if (requestedDraftId) {
    const requestedDraft = await client
      .from("post_drafts")
      .select("content_style,current_version_id")
      .eq("id", requestedDraftId)
      .eq("opportunity_id", String(context.opportunity.id))
      .single();
    if (requestedDraft.error) throw requestedDraft.error;
    if (
      typeof job.request_payload.expectedVersionId === "string" &&
      requestedDraft.data.current_version_id !== job.request_payload.expectedVersionId
    ) {
      throw new WorkerHttpError(409, "post_version_changed", "The selected post version changed.");
    }
    requestedStyles = [z.enum(styles).parse(requestedDraft.data.content_style)];
  }
  const drafts: Array<Record<string, unknown>> = [];
  const prompt = `BRAND: ${String(context.brand.name)}\nPOSITIONING: ${String(profile.positioning ?? "")}\nAUDIENCE: ${String(profile.audience_definition ?? "")}\nSTYLES: ${requestedStyles.join(", ")}\nTONE: thoughtful\nSOURCE TITLE: ${String(source.title ?? "")}\nVALUE NUCLEUS: ${String(context.opportunity.value_nucleus ?? "")}\nEVIDENCE: ${JSON.stringify(research.data.evidence_package)}\nCreate exactly one Facebook draft for every requested style. Each draft must contain three materially different angles. The final drafts must differ in structure and argument, not merely wording.`;
  const operationKey = `${job.idempotency_key}:openai-drafts:${requestedStyles.join("+")}`;
  const operation = await beginProviderOperation(client, job, workerId, operationKey);
  let response: z.infer<typeof structuredProviderResultSchema>;
  if (operation.state === "succeeded") {
    response = structuredProviderResultSchema.parse(operation.result);
  } else {
    try {
      const generated = await structuredResponse<unknown>({
        instructions: LIGHTWEIGHT_WRITER_SYSTEM_PROMPT,
        prompt,
        format: {
          name: "lightweight_facebook_draft_set",
          schema: draftSetJsonSchema(requestedStyles),
        },
        maxOutputTokens: requestedStyles.length === 1 ? 2400 : 6000,
        idempotencyKey: operationKey,
      });
      response = structuredProviderResultSchema.parse(generated);
      await completeProviderOperation(client, job, workerId, operationKey, response, {
        model: response.model,
        responseId: response.responseId,
        usage: response.usage,
        costUsd: response.usage.estimatedCostUsd,
      });
    } catch (error) {
      await failProviderOperation(client, job, workerId, operationKey, error);
      throw error;
    }
  }
  const generatedSet = draftSetResultSchema.parse(response.data);
  const returnedStyles = new Set(generatedSet.drafts.map((draft) => draft.contentStyle));
  if (
    returnedStyles.size !== requestedStyles.length ||
    requestedStyles.some((style) => !returnedStyles.has(style))
  ) {
    throw new WorkerHttpError(
      502,
      "draft_style_set_invalid",
      "The model did not return the complete requested style set.",
    );
  }
  for (const generated of generatedSet.drafts) {
    const style = generated.contentStyle;
    const fullText = [generated.hook, generated.body, generated.closing]
      .filter(Boolean)
      .join("\n\n");
    const promptSnapshot = {
      systemPrompt: LIGHTWEIGHT_WRITER_SYSTEM_PROMPT,
      userPrompt: prompt,
      promptVersion: LIGHTWEIGHT_WRITER_PROMPT_VERSION,
      checksum: await digestHex(`${LIGHTWEIGHT_WRITER_SYSTEM_PROMPT}\n${prompt}`),
    };
    const claimKeys = (
      (research.data.evidence_package as { claims?: Array<{ claimKey?: string }> }).claims ?? []
    )
      .map((claim) => claim.claimKey)
      .filter(Boolean)
      .slice(0, 5);
    const angles = generated.angles.map((angle, index) => ({
      angleKey: `angle_${style.slice(0, 6)}${index + 1}00`,
      ...angle,
      contentStyle: style,
      supportingClaimKeys: claimKeys,
      rankExplanation: "Ranked for evidence fit, distinction, and brand relevance.",
    }));
    const evaluation = evaluateDraft({
      hook: generated.hook,
      body: generated.body,
      closing: generated.closing,
      sourceText: String(source.clean_text ?? ""),
      evidencePackage: research.data.evidence_package as Record<string, unknown>,
      profile,
      priorPosts,
    });
    drafts.push({
      contractVersion: "1.0",
      contentStyle: style,
      tone: "thoughtful",
      angles,
      selectedAngleKey: angles[generated.selectedAngleIndex]!.angleKey,
      content: { hook: generated.hook, body: generated.body, closing: generated.closing, fullText },
      evaluation,
      model: response.model,
      promptVersion: LIGHTWEIGHT_WRITER_PROMPT_VERSION,
      responseId: response.responseId,
      usage: response.usage,
      promptSnapshot,
      ...(requestedDraftId ? { postDraftId: requestedDraftId } : {}),
    });
  }
  return {
    output: { drafts },
    usage: response.usage,
    costUsd: response.usage.estimatedCostUsd,
    nextStage: "verify" as const,
    nextRequest: {
      actorId,
      opportunityId: context.opportunity.id,
      ...(typeof job.request_payload.postDraftId === "string"
        ? { postDraftId: job.request_payload.postDraftId }
        : {}),
    },
  };
}

async function verifyStage(
  client: Client,
  job: Job,
  context: Awaited<ReturnType<typeof loadContext>>,
  actorId: string,
) {
  let draftQuery = client
    .from("post_drafts")
    .select(
      "id,current_version_id,post_versions!post_drafts_current_version_fk(hook,body,closing,full_text)",
    )
    .eq("opportunity_id", String(context.opportunity.id))
    .eq("brand_id", job.brand_id);
  if (typeof job.request_payload.postDraftId === "string") {
    draftQuery = draftQuery.eq("id", job.request_payload.postDraftId);
  }
  const drafts = await draftQuery;
  if (drafts.error) throw drafts.error;
  if (
    typeof job.request_payload.expectedVersionId === "string" &&
    (drafts.data?.length !== 1 ||
      drafts.data[0]?.current_version_id !== job.request_payload.expectedVersionId)
  ) {
    throw new WorkerHttpError(409, "post_version_changed", "The selected post version changed.");
  }
  const research = await client
    .from("research_runs")
    .select("evidence_package")
    .eq("opportunity_id", String(context.opportunity.id))
    .eq("status", "succeeded")
    .order("completed_at", { ascending: false })
    .limit(1)
    .single();
  if (research.error) throw research.error;
  const previous = await client
    .from("post_drafts")
    .select("post_versions!post_drafts_current_version_fk(full_text)")
    .eq("brand_id", job.brand_id)
    .neq("opportunity_id", String(context.opportunity.id))
    .order("updated_at", { ascending: false })
    .limit(50);
  if (previous.error) throw previous.error;
  const priorPosts = (previous.data ?? [])
    .map((item) => String(relation(item.post_versions).full_text ?? ""))
    .filter(Boolean);
  const source = relation(context.opportunity.source_documents);
  const profile = relation(context.brand.brand_profiles);
  const evaluations = (drafts.data ?? []).map((draft) => {
    const version = relation(draft.post_versions);
    return evaluateDraft({
      draftId: String(draft.id),
      hook: String(version.hook ?? ""),
      body: String(version.body ?? ""),
      closing: String(version.closing ?? ""),
      sourceText: String(source.clean_text ?? ""),
      evidencePackage: research.data.evidence_package as Record<string, unknown>,
      profile,
      priorPosts,
    });
  });
  const warnings = evaluations.flatMap((evaluation) => evaluation.warnings);
  const output = {
    verification: { contractVersion: "1.0", warnings, blocking: false },
    evaluations,
  };
  return {
    output,
    usage: {},
    costUsd: 0,
    nextStage: "image" as const,
    nextRequest: {
      actorId,
      opportunityId: context.opportunity.id,
      ...(typeof job.request_payload.postDraftId === "string"
        ? { postDraftId: job.request_payload.postDraftId }
        : {}),
    },
  };
}

async function imageStage(
  client: Client,
  job: Job,
  context: Awaited<ReturnType<typeof loadContext>>,
  actorId: string,
  workerId: string,
) {
  let draftQuery = client
    .from("post_drafts")
    .select(
      "id,current_version_id,content_style,quality_score,post_versions!post_drafts_current_version_fk(hook,body)",
    )
    .eq("opportunity_id", String(context.opportunity.id))
    .eq("brand_id", job.brand_id)
    .order("quality_score", { ascending: false, nullsFirst: false });
  if (typeof job.request_payload.postDraftId === "string") {
    draftQuery = draftQuery.eq("id", job.request_payload.postDraftId);
  }
  const drafts = await draftQuery;
  if (drafts.error) throw drafts.error;
  const profile = relation(context.brand.brand_profiles);
  const visual = relation(profile.visual_system);
  const primary = String(visual.primaryColor ?? visual.primary_color ?? "#D14B2A");
  const accent = String(visual.accentColor ?? visual.accent_color ?? "#D14B2A");
  const source = relation(context.opportunity.source_documents);
  const sourceLabel = (() => {
    try {
      return new URL(String(source.canonical_url ?? "")).hostname.replace(/^www\./, "");
    } catch {
      return "Editorial Desk";
    }
  })();
  const images: Array<Record<string, unknown>> = [];
  let totalCost = 0;
  let totalUsage: Record<string, unknown> = {};
  const maximum = 1;
  for (const draft of (drafts.data ?? []).slice(0, maximum)) {
    const version = relation(draft.post_versions);
    const conceptKey = `concept_${String(draft.content_style).slice(0, 12).replace(/_/g, "")}`;
    const prompt = `${LIGHTWEIGHT_IMAGE_SYSTEM_PROMPT}\nBRAND: ${String(context.brand.name)}\nPOST HOOK: ${String(version.hook ?? "")}\nPOST CONTEXT: ${String(version.body ?? "").slice(0, 1200)}\nCreate only the text-free base artwork.`;
    const operationKey = `${job.idempotency_key}:openai-image:${draft.current_version_id}`;
    const operation = await beginProviderOperation(client, job, workerId, operationKey);
    let generated: {
      bytes: Uint8Array;
      responseId: string;
      model: string;
      costUsd: number;
      usage: Record<string, unknown>;
      basePath: string;
    };
    if (operation.state === "succeeded") {
      const cached = imageProviderResultSchema.parse(operation.result);
      const download = await client.storage.from("generated-images").download(cached.basePath);
      if (download.error) {
        throw new WorkerHttpError(
          409,
          "provider_cache_missing",
          "The completed provider image cache is unavailable and will not be regenerated automatically.",
        );
      }
      generated = { ...cached, bytes: new Uint8Array(await download.data.arrayBuffer()) };
    } else {
      try {
        const provider = await generateBaseImage(prompt, operationKey);
        const providerDigest = (await digestHex(operationKey)).slice(0, 32);
        const basePath = `${job.organization_id}/${job.brand_id}/${draft.id}/provider/${providerDigest}.png`;
        const upload = await client.storage
          .from("generated-images")
          .upload(basePath, provider.bytes, {
            contentType: "image/png",
            upsert: true,
          });
        if (upload.error) throw upload.error;
        const cached = imageProviderResultSchema.parse({
          basePath,
          responseId: provider.responseId,
          model: provider.model,
          costUsd: provider.costUsd,
          usage: provider.usage,
        });
        await completeProviderOperation(client, job, workerId, operationKey, cached, {
          model: cached.model,
          responseId: cached.responseId,
          usage: cached.usage,
          costUsd: cached.costUsd,
        });
        generated = { ...cached, bytes: provider.bytes };
      } catch (error) {
        await failProviderOperation(client, job, workerId, operationKey, error);
        throw error;
      }
    }
    const composed = await composeBrandedImage({
      baseBytes: generated.bytes,
      headline: String(version.hook ?? context.opportunity.value_nucleus ?? "Editorial insight"),
      brandName: String(context.brand.name),
      sourceLabel,
      primaryColor: primary,
      accentColor: accent,
    });
    if (!composed.validation.readyForReview) {
      throw new WorkerHttpError(
        422,
        "final_image_validation_failed",
        `Final image layout failed: ${composed.validation.warnings.join(" ")}`,
      );
    }
    const finalBytes = composed.bytes;
    const imageAssetId = await deterministicUuid(
      `${job.idempotency_key}:${draft.id}:${draft.current_version_id}:image-asset`,
    );
    const prefix = `${job.organization_id}/${job.brand_id}/${draft.id}/${imageAssetId}`;
    const basePath = `${prefix}/base.png`;
    const finalPath = `${prefix}/final.png`;
    for (const [path, bytes] of [
      [basePath, generated.bytes],
      [finalPath, finalBytes],
    ] as const) {
      const uploaded = await client.storage
        .from("generated-images")
        .upload(path, bytes, { contentType: "image/png", upsert: true });
      if (uploaded.error) throw uploaded.error;
    }
    images.push({
      imageAssetId,
      postDraftId: draft.id,
      postVersionId: draft.current_version_id,
      concept: "Evidence-led editorial visual",
      conceptKey,
      conceptDirection: {
        contractVersion: "1.0",
        selectedConceptKey: conceptKey,
        concepts: [
          {
            conceptKey,
            rank: 1,
            title: "Editorial signal",
            visualNucleus: String(context.opportunity.value_nucleus ?? ""),
            imageStyle: "editorial_hero",
          },
          {
            conceptKey: "concept_operating_shift",
            rank: 2,
            title: "Operating shift",
            visualNucleus: "Show the practical operating change without unsupported specifics.",
            imageStyle: "editorial_hero",
          },
          {
            conceptKey: "concept_decision_frame",
            rank: 3,
            title: "Decision frame",
            visualNucleus: "Frame the buyer or operator decision implied by the evidence.",
            imageStyle: "editorial_hero",
          },
        ],
      },
      prompt,
      promptVersion: LIGHTWEIGHT_IMAGE_PROMPT_VERSION,
      baseImagePath: basePath,
      finalImagePath: finalPath,
      baseChecksum: await digestHex(generated.bytes),
      finalChecksum: await digestHex(finalBytes),
      model: generated.model,
      responseId: generated.responseId,
      costUsd: generated.costUsd,
      validation: {
        contractVersion: "1.0",
        readyForComposition: true,
        humanOverrideRequired: false,
        warnings: [],
        finalComposition: composed.validation,
        layout: composed.layout,
        width: composed.validation.width,
        height: composed.validation.height,
      },
    });
    totalCost += generated.costUsd;
    totalUsage = generated.usage;
  }
  return {
    output: { images },
    usage: { ...totalUsage, estimatedCostUsd: totalCost },
    costUsd: totalCost,
    nextStage: "package" as const,
    nextRequest: { actorId, opportunityId: context.opportunity.id },
  };
}

async function packageStage(
  client: Client,
  job: Job,
  context: Awaited<ReturnType<typeof loadContext>>,
  _actorId: string,
) {
  const posts = await client
    .from("post_drafts")
    .select(
      "id,content_style,status,current_version_id,post_versions!post_drafts_current_version_fk(hook,body,closing,full_text),image_assets(id,final_image_path,prompt,prompt_version)",
    )
    .eq("opportunity_id", String(context.opportunity.id));
  if (posts.error) throw posts.error;
  const manifest = {
    contractVersion: "1.0",
    generatedAt: new Date().toISOString(),
    pipelineId: job.pipeline_id,
    brandId: job.brand_id,
    opportunityId: context.opportunity.id,
    posts: posts.data ?? [],
    publishing: "not_permitted",
  };
  const text = JSON.stringify(manifest, null, 2);
  const checksum = await digestHex(text);
  const storagePath = `${job.organization_id}/${job.brand_id}/${job.pipeline_id}/package.json`;
  const upload = await client.storage
    .from("generated-images")
    .upload(storagePath, new TextEncoder().encode(text), {
      contentType: "application/json",
      upsert: true,
    });
  if (upload.error) throw upload.error;
  return {
    output: { manifest, storagePath, checksum },
    usage: {},
    costUsd: 0,
    nextStage: null,
    nextRequest: {},
  };
}

async function executeJob(client: Client, job: Job, workerId: string) {
  const actorId = String(job.request_payload.actorId ?? "");
  if (!z.uuid().safeParse(actorId).success)
    throw new WorkerHttpError(422, "actor_missing", "Pipeline actor is missing.");
  const context = await loadContext(client, job);
  const result =
    job.stage === "research"
      ? await researchStage(client, job, context, actorId, workerId)
      : job.stage === "draft"
        ? await draftStage(client, job, context, actorId, workerId)
        : job.stage === "verify"
          ? await verifyStage(client, job, context, actorId)
          : job.stage === "image"
            ? await imageStage(client, job, context, actorId, workerId)
            : await packageStage(client, job, context, actorId);
  const saved = await persist(client, job, workerId, actorId, result);
  return { jobId: job.job_id, stage: job.stage, status: "succeeded", output: saved };
}

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST")
      throw new WorkerHttpError(405, "method_not_allowed", "POST is required.");
    requireWorkerSecret(request);
    const input = requestSchema.parse(await request.json());
    const client = environmentClient();
    const claim = await client.rpc("claim_pipeline_jobs", {
      requested_worker_id: input.workerId,
      requested_stages: input.stages,
      requested_limit: input.limit,
      requested_lease_seconds: 900,
    });
    if (claim.error) throw claim.error;
    const jobs = z.array(jobSchema).parse(claim.data ?? []);
    const outcomes = [];
    for (const job of jobs) {
      try {
        outcomes.push(await executeJob(client, job, input.workerId));
      } catch (error) {
        const safe = sanitizeError(error);
        const failed = await client.rpc("fail_pipeline_job", {
          payload: {
            jobId: job.job_id,
            workerId: input.workerId,
            errorCode: safe.code,
            category: safe.category,
            summary: safe.summary,
            retryable: safe.retryable,
          },
        });
        outcomes.push({
          jobId: job.job_id,
          stage: job.stage,
          status: "failed",
          retryScheduled: !failed.error && safe.retryable,
          errorCode: safe.code,
        });
      }
    }
    return jsonResponse({ contractVersion: "1.0", claimed: jobs.length, outcomes });
  } catch (error) {
    return safeErrorResponse(error);
  }
});
