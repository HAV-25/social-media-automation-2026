import "server-only";
import { z } from "zod";
import { utcDayStart } from "./brand-archive-policy-core";
import { explainRssRouteFilter } from "./rss-routing-visibility";
import { isRssItemActive, rssItemActivityTimestamp } from "./rss-archive-policy";
import {
  deriveRssSelectionVisibility,
  RSS_AUTOMATIC_MINIMUM_SCORE,
  RSS_REVIEW_MINIMUM_SCORE,
} from "./rss-selection-visibility";
import { createSupabaseServerClient } from "./supabase/server";

const routeRowSchema = z.object({
  rss_feed_id: z.uuid(),
  generation_policy: z.string(),
  include_keywords: z.array(z.string()),
  exclude_keywords: z.array(z.string()),
  rss_feeds: z
    .object({
      name: z.string(),
      last_polled_at: z.string().nullable(),
      last_success_at: z.string().nullable(),
      last_error: z.string().nullable(),
    })
    .nullable(),
});

const itemRowSchema = z.object({
  id: z.uuid(),
  rss_feed_id: z.uuid(),
  title: z.string(),
  first_seen_at: z.string(),
  source_document_id: z.uuid().nullable(),
  source_documents: z
    .object({
      raw_text: z.string().nullable(),
      status: z.string(),
      duplicate_of_source_id: z.uuid().nullable(),
      extraction_confidence: z.union([z.number(), z.string()]).nullable(),
      metadata: z
        .object({
          requiresManualReview: z.boolean().optional(),
          reviewReasons: z.array(z.string()).optional(),
        })
        .passthrough(),
    })
    .nullable(),
});

const sourceLinkRowSchema = z.object({
  source_document_id: z.uuid(),
});

const opportunityRowSchema = z.object({
  id: z.uuid(),
  source_document_id: z.uuid(),
  opportunity_score: z.union([z.number(), z.string()]),
  status: z.string(),
});

const brandPolicyRowSchema = z.object({
  automatic_opportunity_selection: z.boolean(),
  minimum_opportunity_score: z.union([z.number(), z.string()]),
  daily_draft_limit: z.number().int().nonnegative(),
});

const reservationRowSchema = z.object({
  entity_id: z.uuid(),
  created_at: z.string(),
});

const resurfaceRowSchema = z.object({
  rss_feed_item_id: z.uuid(),
  resurfaced_at: z.string(),
});

export type RssDailyItemDecision = {
  itemId: string;
  feedId: string;
  feedName: string;
  title: string;
  firstSeenAt: string;
  inCurrentWindow: boolean;
  state: "scored" | "filtered" | "duplicate" | "pending";
  explanation: string;
  score: number | null;
  opportunityId: string | null;
  opportunityStatus: string | null;
  analysisBasis: "full_article" | "rss_summary" | null;
  resurfacedAt: string | null;
  selection:
    | "selected"
    | "review"
    | "stored_only"
    | "below_threshold"
    | "daily_limit"
    | "ingest_only"
    | "awaiting_selection"
    | "not_applicable";
};

export type RssDailyDecision = {
  feedId: string;
  feedName: string;
  lastPolledAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  itemsSeen: number;
  scored: number;
  filtered: number;
  pending: number;
  latestItem: {
    title: string;
    state: "scored" | "filtered" | "duplicate" | "pending";
    explanation: string;
    score: number | null;
    opportunityId: string | null;
  } | null;
};

export type RssDailyOverview = {
  feeds: RssDailyDecision[];
  items: RssDailyItemDecision[];
  policy: {
    automaticSelection: boolean;
    minimumScore: number;
    dailyLimit: number;
    selectedToday: number;
    reviewMinimumScore: number;
  };
};

export async function getRssDailyDecisions(
  brandId: string,
  since: string,
  resurfaceWindowStart = since,
): Promise<RssDailyOverview> {
  const emptyPolicy = {
    automaticSelection: false,
    minimumScore: RSS_AUTOMATIC_MINIMUM_SCORE,
    dailyLimit: 0,
    selectedToday: 0,
    reviewMinimumScore: RSS_REVIEW_MINIMUM_SCORE,
  };
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    return { feeds: [], items: [], policy: emptyPolicy };
  }
  const supabase = await createSupabaseServerClient();
  const [{ data: rawRoutes, error: routeError }, { data: rawPolicy, error: policyError }] =
    await Promise.all([
      supabase
        .from("rss_feed_brand_links")
        .select(
          "rss_feed_id,generation_policy,include_keywords,exclude_keywords,rss_feeds(name,last_polled_at,last_success_at,last_error)",
        )
        .eq("brand_id", brandId),
      supabase
        .from("brand_profiles")
        .select("automatic_opportunity_selection,minimum_opportunity_score,daily_draft_limit")
        .eq("brand_id", brandId)
        .single(),
    ]);
  if (routeError || policyError) {
    throw new Error(`Unable to load RSS route decisions: ${(routeError ?? policyError)?.message}`);
  }
  const routes = z.array(routeRowSchema).parse(rawRoutes ?? []);
  const rawBrandPolicy = brandPolicyRowSchema.parse(rawPolicy);
  const policy = {
    automaticSelection: rawBrandPolicy.automatic_opportunity_selection,
    minimumScore: Number(rawBrandPolicy.minimum_opportunity_score),
    dailyLimit: rawBrandPolicy.daily_draft_limit,
    selectedToday: 0,
    reviewMinimumScore: RSS_REVIEW_MINIMUM_SCORE,
  };
  if (!routes.length) return { feeds: [], items: [], policy };

  const feedIds = routes.map((route) => route.rss_feed_id);
  const { data: rawResurfaceRows, error: resurfaceError } = await supabase
    .from("rss_item_review_states")
    .select("rss_feed_item_id,resurfaced_at")
    .eq("brand_id", brandId)
    .gte("resurfaced_at", resurfaceWindowStart);
  if (resurfaceError) throw new Error("Unable to load resurfaced RSS items.");
  const resurfaceRows = z.array(resurfaceRowSchema).parse(rawResurfaceRows ?? []);
  const resurfacedAtByItem = new Map(
    resurfaceRows.map((row) => [row.rss_feed_item_id, row.resurfaced_at] as const),
  );
  const resurfacedItemIds = [...resurfacedAtByItem.keys()];
  const itemSelect =
    "id,rss_feed_id,title,first_seen_at,source_document_id,source_documents(raw_text,status,duplicate_of_source_id,extraction_confidence,metadata)";
  const [recentResult, resurfacedResult] = await Promise.all([
    supabase
      .from("rss_feed_items")
      .select(itemSelect)
      .in("rss_feed_id", feedIds)
      .gte("first_seen_at", since)
      .order("first_seen_at", { ascending: false })
      .limit(100),
    resurfacedItemIds.length
      ? supabase
          .from("rss_feed_items")
          .select(itemSelect)
          .in("rss_feed_id", feedIds)
          .in("id", resurfacedItemIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (recentResult.error || resurfacedResult.error) {
    throw new Error(
      `Unable to load the active RSS window: ${
        (recentResult.error ?? resurfacedResult.error)?.message
      }`,
    );
  }
  const recentItems = z.array(itemRowSchema).parse(recentResult.data ?? []);
  const resurfacedItems = z.array(itemRowSchema).parse(resurfacedResult.data ?? []);
  const visibleItems = [
    ...new Map(
      [...recentItems, ...resurfacedItems].map((item) => [item.id, item] as const),
    ).values(),
  ].sort(
    (left, right) =>
      rssItemActivityTimestamp({
        firstSeenAt: right.first_seen_at,
        resurfacedAt: resurfacedAtByItem.get(right.id),
      }) -
      rssItemActivityTimestamp({
        firstSeenAt: left.first_seen_at,
        resurfacedAt: resurfacedAtByItem.get(left.id),
      }),
  );
  const dailySelectionStart = utcDayStart(new Date());
  const dailySelectionStartMs = Date.parse(dailySelectionStart);
  const items = visibleItems;
  const sourceIds = visibleItems
    .map((item) => item.source_document_id)
    .filter((id): id is string => Boolean(id));

  const [sourceLinksResult, opportunitiesResult] = sourceIds.length
    ? await Promise.all([
        supabase
          .from("source_brand_links")
          .select("source_document_id")
          .eq("brand_id", brandId)
          .in("source_document_id", sourceIds),
        supabase
          .from("opportunities")
          .select("id,source_document_id,opportunity_score,status")
          .eq("brand_id", brandId)
          .in("source_document_id", sourceIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (sourceLinksResult.error || opportunitiesResult.error) {
    throw new Error("Unable to load today's RSS routing and scoring decisions.");
  }
  const routedSourceIds = new Set(
    z
      .array(sourceLinkRowSchema)
      .parse(sourceLinksResult.data ?? [])
      .map((link) => link.source_document_id),
  );
  const opportunities = z.array(opportunityRowSchema).parse(opportunitiesResult.data ?? []);
  const opportunitiesBySource = new Map(
    opportunities.map((opportunity) => [opportunity.source_document_id, opportunity]),
  );
  const opportunityIds = opportunities.map((opportunity) => opportunity.id);
  let reservationQuery = supabase
    .from("generation_runs")
    .select("entity_id,created_at")
    .eq("brand_id", brandId)
    .eq("run_type", "rss_opportunity_reservation")
    .eq("status", "succeeded");
  reservationQuery = opportunityIds.length
    ? reservationQuery.or(
        `created_at.gte.${dailySelectionStart},entity_id.in.(${opportunityIds.join(",")})`,
      )
    : reservationQuery.gte("created_at", dailySelectionStart);
  const { data: rawReservations, error: reservationError } = await reservationQuery;
  if (reservationError) throw new Error("Unable to load today's RSS selection decisions.");
  const reservations = z.array(reservationRowSchema).parse(rawReservations ?? []);
  const opportunityById = new Map(
    opportunities.map((opportunity) => [opportunity.id, opportunity]),
  );
  const sourceById = new Map(
    visibleItems
      .filter((item) => item.source_document_id && item.source_documents)
      .map((item) => [item.source_document_id!, item.source_documents!]),
  );
  const summaryOnly = (sourceDocumentId: string) =>
    sourceById.get(sourceDocumentId)?.metadata.requiresManualReview === true;
  const qualifiesUnderCurrentPolicy = (opportunityId: string) => {
    const opportunity = opportunityById.get(opportunityId);
    return Boolean(
      opportunity &&
        Number(opportunity.opportunity_score) >= policy.minimumScore &&
        !summaryOnly(opportunity.source_document_id),
    );
  };
  const selectedOpportunityIds = new Set(
    reservations
      .filter((reservation) => qualifiesUnderCurrentPolicy(reservation.entity_id))
      .map((reservation) => reservation.entity_id),
  );
  policy.selectedToday = new Set(
    reservations
      .filter(
        (reservation) =>
          Date.parse(reservation.created_at) >= dailySelectionStartMs &&
          qualifiesUnderCurrentPolicy(reservation.entity_id),
      )
      .map((reservation) => reservation.entity_id),
  ).size;

  const feedDecisions = routes
    .map((route) => {
      const routeItems = items.filter((item) => item.rss_feed_id === route.rss_feed_id);
      const decisions = routeItems.map((item) => {
        const sourceId = item.source_document_id;
        const opportunity = sourceId ? opportunitiesBySource.get(sourceId) : null;
        if (opportunity) {
          const basis = summaryOnly(opportunity.source_document_id)
            ? "RSS summary only; automatic preparation is disabled"
            : "Scored from the safely extracted full article";
          return {
            title: item.title,
            state: "scored" as const,
            explanation: `${basis} · Opportunity ${opportunity.status.replaceAll("_", " ")}`,
            score: Number(opportunity.opportunity_score),
            opportunityId: opportunity.id,
          };
        }
        if (item.source_documents?.duplicate_of_source_id) {
          return {
            title: item.title,
            state: "duplicate" as const,
            explanation: "Duplicate content; the existing source was retained",
            score: null,
            opportunityId: null,
          };
        }
        if (sourceId && routedSourceIds.has(sourceId)) {
          return {
            title: item.title,
            state: "pending" as const,
            explanation: "Matched the brand and is awaiting scoring",
            score: null,
            opportunityId: null,
          };
        }
        return {
          title: item.title,
          state: "filtered" as const,
          explanation: explainRssRouteFilter({
            title: item.title,
            rawText: item.source_documents?.raw_text ?? null,
            includeKeywords: route.include_keywords,
            excludeKeywords: route.exclude_keywords,
          }),
          score: null,
          opportunityId: null,
        };
      });

      return {
        feedId: route.rss_feed_id,
        feedName: route.rss_feeds?.name ?? "RSS feed",
        lastPolledAt: route.rss_feeds?.last_polled_at ?? null,
        lastSuccessAt: route.rss_feeds?.last_success_at ?? null,
        lastError: route.rss_feeds?.last_error ?? null,
        itemsSeen: decisions.length,
        scored: decisions.filter((decision) => decision.state === "scored").length,
        filtered: decisions.filter((decision) => decision.state === "filtered").length,
        pending: decisions.filter((decision) => decision.state === "pending").length,
        latestItem: decisions[0] ?? null,
      } satisfies RssDailyDecision;
    })
    .sort((left, right) => left.feedName.localeCompare(right.feedName));

  const routeByFeed = new Map(routes.map((route) => [route.rss_feed_id, route]));
  const feedNameById = new Map(
    feedDecisions.map((decision) => [decision.feedId, decision.feedName]),
  );
  const itemDecisions = visibleItems.map((item) => {
    const route = routeByFeed.get(item.rss_feed_id);
    const sourceId = item.source_document_id;
    const opportunity = sourceId ? opportunitiesBySource.get(sourceId) : null;
    const base = {
      itemId: item.id,
      feedId: item.rss_feed_id,
      feedName: feedNameById.get(item.rss_feed_id) ?? "RSS feed",
      title: item.title,
      firstSeenAt: item.first_seen_at,
      inCurrentWindow: isRssItemActive({
        firstSeenAt: item.first_seen_at,
        resurfacedAt: resurfacedAtByItem.get(item.id),
        resurfaceWindowStart,
        windowStart: since,
      }),
      resurfacedAt: resurfacedAtByItem.get(item.id) ?? null,
    };
    if (opportunity) {
      const score = Number(opportunity.opportunity_score);
      const isSummaryOnly = summaryOnly(opportunity.source_document_id);
      const selection = deriveRssSelectionVisibility({
        selected: selectedOpportunityIds.has(opportunity.id),
        automaticPreparationAllowed: !isSummaryOnly,
        automaticSelection: policy.automaticSelection,
        generationPolicy: route?.generation_policy ?? null,
        score,
        minimumScore: policy.minimumScore,
        selectedToday: policy.selectedToday,
        dailyLimit: policy.dailyLimit,
      });
      return {
        ...base,
        state: "scored" as const,
        explanation: isSummaryOnly
          ? "RSS summary only; stored for review and excluded from automatic preparation"
          : `Scored from the safely extracted full article · Opportunity ${opportunity.status.replaceAll("_", " ")}`,
        score,
        opportunityId: opportunity.id,
        opportunityStatus: opportunity.status,
        analysisBasis: isSummaryOnly ? ("rss_summary" as const) : ("full_article" as const),
        selection,
      };
    }
    if (item.source_documents?.duplicate_of_source_id) {
      return {
        ...base,
        state: "duplicate" as const,
        explanation: "Duplicate content; the existing source was retained",
        score: null,
        opportunityId: null,
        opportunityStatus: null,
        analysisBasis: null,
        selection: "not_applicable" as const,
      };
    }
    if (sourceId && routedSourceIds.has(sourceId)) {
      return {
        ...base,
        state: "pending" as const,
        explanation: "Matched the brand and is awaiting scoring",
        score: null,
        opportunityId: null,
        opportunityStatus: null,
        analysisBasis: null,
        selection: "not_applicable" as const,
      };
    }
    return {
      ...base,
      state: "filtered" as const,
      explanation: explainRssRouteFilter({
        title: item.title,
        rawText: item.source_documents?.raw_text ?? null,
        includeKeywords: route?.include_keywords ?? [],
        excludeKeywords: route?.exclude_keywords ?? [],
      }),
      score: null,
      opportunityId: null,
      opportunityStatus: null,
      analysisBasis: null,
      selection: "not_applicable" as const,
    };
  });

  return {
    feeds: feedDecisions,
    items: itemDecisions,
    policy,
  };
}
