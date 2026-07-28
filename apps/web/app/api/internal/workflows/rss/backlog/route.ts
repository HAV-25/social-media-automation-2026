import {
  rssDeferredSweepRequestSchema,
  rssDeferredSweepResultSchema,
} from "@content-engine/contracts";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  classifyDeferredRssProgress,
  deferredOpportunityRowSchema,
  selectDeferredRssCandidates,
} from "@/lib/rss-deferred-candidates";
import { createDailyRssReservationIdentity } from "@/lib/rss-reservation-key";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { authenticateWorkflowRequest, WorkflowAuthError } from "@/lib/workflow-auth";

export const dynamic = "force-dynamic";

const brandRowSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
});
const profileRowSchema = z.object({
  brand_id: z.uuid(),
  automatic_opportunity_selection: z.boolean(),
  minimum_opportunity_score: z.coerce.number().min(0).max(100),
  daily_draft_limit: z.number().int().min(0).max(20),
  updated_at: z.iso.datetime({ offset: true }),
});
const opportunityIdRowSchema = z.object({
  opportunity_id: z.uuid(),
});
const generationRunRowSchema = z.object({
  id: z.uuid(),
  entity_id: z.uuid(),
  run_type: z.string().min(1).max(100),
  status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]),
});
const feedItemRowSchema = z.object({
  source_document_id: z.uuid(),
  rss_feed_id: z.uuid(),
});
const feedRowSchema = z.object({
  id: z.uuid(),
  active: z.boolean(),
});
const feedLinkRowSchema = z.object({
  rss_feed_id: z.uuid(),
  generation_policy: z.enum(["ingest_only", "score_then_research"]),
});
const actorRowSchema = z.object({
  user_id: z.uuid(),
});
const reservationRowSchema = z.object({
  eligible: z.boolean(),
  reason: z.enum([
    "reserved",
    "already_prepared",
    "ingest_only",
    "below_threshold",
    "daily_limit",
    "inactive",
  ]),
  generation_run_id: z.uuid().nullable(),
  duplicate: z.boolean(),
});

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    await authenticateWorkflowRequest(request, rawBody);
    const payload = rssDeferredSweepRequestSchema.parse(JSON.parse(rawBody));
    const supabase = createSupabaseServiceClient();

    let profileQuery = supabase
      .from("brand_profiles")
      .select(
        "brand_id,automatic_opportunity_selection,minimum_opportunity_score,daily_draft_limit,updated_at",
      )
      .eq("automatic_opportunity_selection", true)
      .gt("daily_draft_limit", 0)
      .order("brand_id");
    if (payload.brandId) profileQuery = profileQuery.eq("brand_id", payload.brandId);
    const { data: rawProfiles, error: profileError } = await profileQuery;
    if (profileError) throw profileError;
    const profiles = z.array(profileRowSchema).parse(rawProfiles ?? []);
    if (!profiles.length) {
      return NextResponse.json(
        rssDeferredSweepResultSchema.parse({ contractVersion: "1.0", selections: [] }),
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const { data: rawBrands, error: brandError } = await supabase
      .from("brands")
      .select("id,organization_id")
      .in(
        "id",
        profiles.map((profile) => profile.brand_id),
      );
    if (brandError) throw brandError;
    const brands = z.array(brandRowSchema).parse(rawBrands ?? []);
    const selections: z.input<typeof rssDeferredSweepResultSchema>["selections"] = [];

    for (const profile of profiles) {
      const brand = brands.find((candidate) => candidate.id === profile.brand_id);
      if (!brand) continue;
      const { data: rawActor, error: actorError } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", brand.organization_id)
        .eq("role", "administrator")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (actorError) throw actorError;
      const actor = rawActor ? actorRowSchema.parse(rawActor) : null;
      if (!actor) continue;

      const requestedAt = new Date(payload.requestedAt);
      const cutoff = new Date(requestedAt.getTime() - 24 * 60 * 60 * 1_000).toISOString();
      const { data: rawOpportunities, error: opportunityError } = await supabase
        .from("opportunities")
        .select("id,source_document_id,opportunity_score,status,created_at")
        .eq("brand_id", profile.brand_id)
        .gte("opportunity_score", profile.minimum_opportunity_score)
        .gte("created_at", cutoff)
        .in("status", ["candidate", "ready_to_generate"])
        .order("opportunity_score", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(100);
      if (opportunityError) throw opportunityError;
      const opportunities = z.array(deferredOpportunityRowSchema).parse(rawOpportunities ?? []);
      if (!opportunities.length) continue;

      const opportunityIds = opportunities.map((opportunity) => opportunity.id);
      const sourceDocumentIds = opportunities.map((opportunity) => opportunity.source_document_id);
      const [
        { data: rawDrafts, error: draftError },
        { data: rawRuns, error: runError },
        { data: rawFeedItems, error: feedItemError },
      ] = await Promise.all([
        supabase.from("post_drafts").select("opportunity_id").in("opportunity_id", opportunityIds),
        supabase
          .from("generation_runs")
          .select("id,entity_id,run_type,status")
          .eq("brand_id", profile.brand_id)
          .in("entity_id", opportunityIds),
        supabase
          .from("rss_feed_items")
          .select("source_document_id,rss_feed_id")
          .in("source_document_id", sourceDocumentIds),
      ]);
      if (draftError || runError || feedItemError) {
        throw draftError ?? runError ?? feedItemError;
      }
      const drafts = z.array(opportunityIdRowSchema).parse(rawDrafts ?? []);
      const runs = z.array(generationRunRowSchema).parse(rawRuns ?? []);
      const feedItems = z.array(feedItemRowSchema).parse(rawFeedItems ?? []);
      const feedIds = [...new Set(feedItems.map((item) => item.rss_feed_id))];
      if (!feedIds.length) continue;

      const [{ data: rawFeeds, error: feedError }, { data: rawLinks, error: linkError }] =
        await Promise.all([
          supabase.from("rss_feeds").select("id,active").in("id", feedIds).eq("active", true),
          supabase
            .from("rss_feed_brand_links")
            .select("rss_feed_id,generation_policy")
            .eq("brand_id", profile.brand_id)
            .in("rss_feed_id", feedIds)
            .eq("generation_policy", "score_then_research"),
        ]);
      if (feedError || linkError) throw feedError ?? linkError;
      const feeds = z.array(feedRowSchema).parse(rawFeeds ?? []);
      const links = z.array(feedLinkRowSchema).parse(rawLinks ?? []);
      const eligibleFeedIds = new Set(
        links
          .filter((link) => feeds.some((feed) => feed.id === link.rss_feed_id && feed.active))
          .map((link) => link.rss_feed_id),
      );
      const eligibleSourceDocumentIds = new Set(
        feedItems
          .filter((item) => eligibleFeedIds.has(item.rss_feed_id))
          .map((item) => item.source_document_id),
      );
      const { blockedOpportunityIds, existingReservationByOpportunity } =
        classifyDeferredRssProgress({
          draftedOpportunityIds: drafts.map((draft) => draft.opportunity_id),
          runs,
        });
      const candidates = selectDeferredRssCandidates({
        opportunities,
        blockedOpportunityIds,
        rssSourceDocumentIds: eligibleSourceDocumentIds,
        requestedAt: payload.requestedAt,
      });

      for (const candidate of candidates) {
        const existingReservationRunId = existingReservationByOpportunity.get(candidate.id);
        if (existingReservationRunId) {
          selections.push({
            actorId: actor.user_id,
            brandId: profile.brand_id,
            opportunityId: candidate.id,
            reservationRunId: existingReservationRunId,
            score: candidate.opportunity_score,
          });
          continue;
        }
        const feedItem = feedItems.find(
          (item) =>
            item.source_document_id === candidate.source_document_id &&
            eligibleFeedIds.has(item.rss_feed_id),
        );
        if (!feedItem) continue;
        const identity = createDailyRssReservationIdentity({
          sourceDocumentId: candidate.source_document_id,
          brandId: profile.brand_id,
          profileUpdatedAt: profile.updated_at,
          requestedAt: payload.requestedAt,
        });
        const { data: rawReservation, error: claimError } = await supabase
          .rpc("reserve_rss_generation", {
            payload: {
              contractVersion: "1.0",
              correlationId: payload.correlationId,
              idempotencyKey: identity.idempotencyKey,
              requestHash: identity.requestHash,
              feedId: feedItem.rss_feed_id,
              brandId: profile.brand_id,
              sourceDocumentId: candidate.source_document_id,
              opportunityId: candidate.id,
              opportunityScore: Number(candidate.opportunity_score),
              requestedAt: payload.requestedAt,
              sweepIdempotencyKey: payload.idempotencyKey,
            },
          })
          .single();
        if (claimError) throw claimError;
        const reservation = reservationRowSchema.parse(rawReservation);
        if (reservation.reason === "daily_limit") break;
        if (!reservation.eligible || reservation.duplicate || !reservation.generation_run_id) {
          continue;
        }
        selections.push({
          actorId: actor.user_id,
          brandId: profile.brand_id,
          opportunityId: candidate.id,
          reservationRunId: reservation.generation_run_id,
          score: candidate.opportunity_score,
        });
      }
    }

    return NextResponse.json(
      rssDeferredSweepResultSchema.parse({
        contractVersion: "1.0",
        selections,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof WorkflowAuthError) {
      return failure(error.status, error.code, error.message);
    }
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return failure(400, "invalid_request", "Deferred RSS sweep contract is invalid.");
    }
    return failure(
      500,
      "deferred_sweep_failed",
      "Deferred RSS opportunities could not be selected.",
    );
  }
}
