import {
  manualInputResultSchema,
  rssSourceAnalysisRequestSchema,
  rssSourceAnalysisResultSchema,
} from "@content-engine/contracts";
import { fetchAndExtractUrl } from "@content-engine/source-processing";
import { type NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { persistNormalizedSource } from "@/lib/persist-normalized-source";
import { selectRssAnalysisSource } from "@/lib/rss-analysis-source";
import { createDailyRssReservationIdentity } from "@/lib/rss-reservation-key";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { authenticateWorkflowRequest, WorkflowAuthError } from "@/lib/workflow-auth";

export const dynamic = "force-dynamic";

const sourceRowSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  title: z.string().nullable(),
  raw_text: z.string().nullable(),
  canonical_url: z.string().nullable(),
  content_hash: z.string().regex(/^[0-9a-f]{64}$/),
  author: z.string().nullable(),
  publisher: z.string().nullable(),
  published_at: z.string().nullable(),
});

const feedRowSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  created_by: z.uuid().nullable(),
});

const brandRouteSchema = z.object({
  brand_id: z.uuid(),
});
const organizationActorSchema = z.object({
  user_id: z.uuid(),
});
const brandProfileSchema = z.object({
  brand_id: z.uuid(),
  audience_definition: z.string(),
  positioning: z.string(),
  content_pillars: z.array(z.string()),
  restricted_topics: z.array(z.string()),
  updated_at: z.string(),
});

const reservationRowSchema = z.object({
  eligible: z.boolean(),
  reason: z.enum(["reserved", "ingest_only", "below_threshold", "daily_limit", "inactive"]),
});
const internalFailureSchema = z.object({
  error: z.object({
    code: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(1_000),
  }),
});

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  try {
    await authenticateWorkflowRequest(request, rawBody);
    const payload = rssSourceAnalysisRequestSchema.parse(JSON.parse(rawBody));
    const supabase = createSupabaseServiceClient();
    const [{ data: rawSource, error: sourceError }, { data: rawFeed, error: feedError }] =
      await Promise.all([
        supabase
          .from("source_documents")
          .select(
            "id,organization_id,title,raw_text,canonical_url,content_hash,author,publisher,published_at",
          )
          .eq("id", payload.sourceDocumentId)
          .eq("source_type", "rss")
          .maybeSingle(),
        supabase
          .from("rss_feeds")
          .select("id,organization_id,created_by")
          .eq("id", payload.feedId)
          .maybeSingle(),
      ]);
    if (sourceError || feedError) throw sourceError ?? feedError;
    if (!rawSource || !rawFeed) {
      return failure(404, "rss_source_not_found", "The RSS source or feed was not found.");
    }
    const source = sourceRowSchema.parse(rawSource);
    const feed = feedRowSchema.parse(rawFeed);
    if (source.organization_id !== feed.organization_id) {
      return failure(404, "rss_source_not_found", "The source does not belong to this feed.");
    }

    const { data: rawRoutes, error: routeError } = await supabase
      .from("source_brand_links")
      .select("brand_id")
      .eq("source_document_id", source.id)
      .eq("organization_id", source.organization_id);
    if (routeError) throw routeError;
    const routes = z.array(brandRouteSchema).parse(rawRoutes ?? []);
    if (!routes.length) {
      return NextResponse.json(
        rssSourceAnalysisResultSchema.parse({
          contractVersion: "1.0",
          sourceDocumentId: source.id,
          results: [],
        }),
      );
    }
    let actorId = feed.created_by;
    if (!actorId) {
      const { data: rawActor, error: actorError } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", source.organization_id)
        .eq("role", "administrator")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (actorError) throw actorError;
      if (!rawActor) {
        return failure(
          422,
          "rss_actor_unavailable",
          "The RSS feed needs a creator or organization administrator before analysis.",
        );
      }
      actorId = organizationActorSchema.parse(rawActor).user_id;
    }
    const { data: rawProfiles, error: profileError } = await supabase
      .from("brand_profiles")
      .select(
        "brand_id,audience_definition,positioning,content_pillars,restricted_topics,updated_at",
      )
      .in(
        "brand_id",
        routes.map((route) => route.brand_id),
      );
    if (profileError) throw profileError;
    const profiles = z.array(brandProfileSchema).parse(rawProfiles ?? []);

    const summaryText = [source.title, source.raw_text].filter(Boolean).join("\n\n");
    if (summaryText.trim().length < 20) {
      await supabase
        .from("source_documents")
        .update({
          status: "extraction_failed",
          status_reason: "RSS title and summary were too short to analyze.",
        })
        .eq("id", source.id);
      return failure(422, "rss_content_too_short", "The RSS item has too little text to analyze.");
    }
    const extracted = source.canonical_url
      ? await fetchAndExtractUrl({
          url: source.canonical_url,
          language: "en",
          provenance: {
            submittedBy: actorId,
            originalUrl: source.canonical_url,
            author: source.author ?? undefined,
            publisher: source.publisher ?? undefined,
            publishedAt: source.published_at
              ? new Date(source.published_at).toISOString()
              : undefined,
            receivedAt: payload.requestedAt,
          },
        })
      : null;
    const analysisSource = selectRssAnalysisSource({
      source: {
        title: source.title,
        rawText: source.raw_text,
        canonicalUrl: source.canonical_url,
        author: source.author,
        publisher: source.publisher,
        publishedAt: source.published_at,
      },
      actorId,
      requestedAt: payload.requestedAt,
      extracted,
    });

    const results = [];
    for (const route of routes) {
      const profile = profiles.find((candidate) => candidate.brand_id === route.brand_id);
      if (!profile) continue;
      const routeIdempotencyKey = `${payload.idempotencyKey}:${route.brand_id}`;
      const persisted = await persistNormalizedSource({
        request,
        actorId,
        organizationId: source.organization_id,
        brandId: route.brand_id,
        idempotencyKey: routeIdempotencyKey,
        sourceType: "rss",
        sourceDocumentId: source.id,
        contentHashOverride: source.content_hash,
        source: analysisSource.source,
        rawText: source.raw_text,
        scorePolicy: {
          audienceDefinition: profile.audience_definition,
          positioning: profile.positioning,
          contentPillars: profile.content_pillars,
          restrictedTopics: profile.restricted_topics,
        },
      });
      if (!persisted.ok) {
        const body = internalFailureSchema.safeParse(await persisted.json());
        return failure(
          persisted.status,
          body.success ? body.data.error.code : "rss_opportunity_persistence_failed",
          body.success ? body.data.error.message : "RSS opportunity persistence failed.",
        );
      }
      const opportunity = manualInputResultSchema.parse(await persisted.json());
      const reservationIdentity = createDailyRssReservationIdentity({
        sourceDocumentId: source.id,
        brandId: route.brand_id,
        profileUpdatedAt: profile.updated_at,
        requestedAt: payload.requestedAt,
      });
      const reservationPayload = {
        contractVersion: "1.0",
        correlationId: payload.correlationId,
        idempotencyKey: reservationIdentity.idempotencyKey,
        feedId: feed.id,
        brandId: route.brand_id,
        sourceDocumentId: source.id,
        opportunityId: opportunity.opportunityId,
        opportunityScore: opportunity.score,
        requestedAt: payload.requestedAt,
      };
      const reservation = analysisSource.automaticPreparationAllowed
        ? await (async () => {
            const { data: rawReservation, error: reservationError } = await supabase
              .rpc("reserve_rss_generation", {
                payload: {
                  ...reservationPayload,
                  requestHash: reservationIdentity.requestHash,
                },
              })
              .single();
            if (reservationError) throw reservationError;
            return reservationRowSchema.parse(rawReservation);
          })()
        : ({ eligible: false, reason: "ingest_only" } as const);
      results.push({
        actorId,
        brandId: route.brand_id,
        opportunityId: opportunity.opportunityId,
        score: opportunity.score,
        riskPenalty: opportunity.riskPenalty,
        duplicate: opportunity.duplicate,
        analysisBasis: analysisSource.analysisBasis,
        researchEligible: reservation.eligible,
        eligibilityReason: reservation.reason,
      });
    }

    return NextResponse.json(
      rssSourceAnalysisResultSchema.parse({
        contractVersion: "1.0",
        sourceDocumentId: source.id,
        results,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof WorkflowAuthError) {
      return failure(error.status, error.code, error.message);
    }
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return failure(400, "invalid_request", "RSS source analysis contract is invalid.");
    }
    return failure(500, "rss_analysis_failed", "RSS source analysis could not be completed.");
  }
}
