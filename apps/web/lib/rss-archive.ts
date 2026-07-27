import "server-only";
import { z } from "zod";
import { isRssItemActive } from "./rss-archive-policy";
import { createSupabaseServerClient } from "./supabase/server";

const routeSchema = z.object({
  rss_feed_id: z.uuid(),
  rss_feeds: z.object({ name: z.string() }).nullable(),
});

const itemSchema = z.object({
  id: z.uuid(),
  rss_feed_id: z.uuid(),
  title: z.string(),
  first_seen_at: z.string(),
  source_document_id: z.uuid().nullable(),
});

const opportunitySchema = z.object({
  id: z.uuid(),
  source_document_id: z.uuid(),
  opportunity_score: z.union([z.number(), z.string()]),
  status: z.string(),
});

const postSchema = z.object({
  opportunity_id: z.uuid(),
  status: z.string(),
});

const auditSchema = z.object({
  rss_feed_item_id: z.uuid(),
  resurfaced_at: z.string(),
});

export type RssArchiveItem = {
  itemId: string;
  feedName: string;
  title: string;
  firstSeenAt: string;
  opportunityId: string | null;
  score: number | null;
  opportunityStatus: string | null;
  postStatuses: string[];
  lastResurfacedAt: string | null;
};

export async function getRssArchive(
  brandId: string,
  before: string,
  resurfaceWindowStart: string,
  limit = 100,
): Promise<RssArchiveItem[]> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") return [];
  const supabase = await createSupabaseServerClient();
  const { data: rawRoutes, error: routeError } = await supabase
    .from("rss_feed_brand_links")
    .select("rss_feed_id,rss_feeds(name)")
    .eq("brand_id", brandId);
  if (routeError) throw new Error("Unable to load RSS archive routes.");
  const routes = z.array(routeSchema).parse(rawRoutes ?? []);
  if (!routes.length) return [];

  const feedIds = routes.map((route) => route.rss_feed_id);
  const { data: rawItems, error: itemError } = await supabase
    .from("rss_feed_items")
    .select("id,rss_feed_id,title,first_seen_at,source_document_id")
    .in("rss_feed_id", feedIds)
    .lt("first_seen_at", before)
    .order("first_seen_at", { ascending: false })
    .limit(limit);
  if (itemError) throw new Error("Unable to load archived RSS items.");
  const items = z.array(itemSchema).parse(rawItems ?? []);
  if (!items.length) return [];

  const itemIds = items.map((item) => item.id);
  const sourceIds = items
    .map((item) => item.source_document_id)
    .filter((id): id is string => Boolean(id));
  const [{ data: rawAudits, error: auditError }, opportunityResult] = await Promise.all([
    supabase
      .from("rss_item_review_states")
      .select("rss_feed_item_id,resurfaced_at")
      .eq("brand_id", brandId)
      .in("rss_feed_item_id", itemIds)
      .order("resurfaced_at", { ascending: false }),
    sourceIds.length
      ? supabase
          .from("opportunities")
          .select("id,source_document_id,opportunity_score,status")
          .eq("brand_id", brandId)
          .in("source_document_id", sourceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (auditError || opportunityResult.error) throw new Error("Unable to load archive history.");
  const opportunities = z.array(opportunitySchema).parse(opportunityResult.data ?? []);
  const opportunityIds = opportunities.map((opportunity) => opportunity.id);
  const { data: rawPosts, error: postError } = opportunityIds.length
    ? await supabase
        .from("post_drafts")
        .select("opportunity_id,status")
        .eq("brand_id", brandId)
        .in("opportunity_id", opportunityIds)
    : { data: [], error: null };
  if (postError) throw new Error("Unable to load archived article outcomes.");

  const opportunityBySource = new Map(
    opportunities.map((opportunity) => [opportunity.source_document_id, opportunity] as const),
  );
  const postStatusesByOpportunity = new Map<string, Set<string>>();
  for (const post of z.array(postSchema).parse(rawPosts ?? [])) {
    const statuses = postStatusesByOpportunity.get(post.opportunity_id) ?? new Set<string>();
    statuses.add(post.status);
    postStatusesByOpportunity.set(post.opportunity_id, statuses);
  }
  const lastResurfacedAtByItem = new Map<string, string>();
  for (const audit of z.array(auditSchema).parse(rawAudits ?? [])) {
    if (!lastResurfacedAtByItem.has(audit.rss_feed_item_id)) {
      lastResurfacedAtByItem.set(audit.rss_feed_item_id, audit.resurfaced_at);
    }
  }
  const feedNameById = new Map(
    routes.map((route) => [route.rss_feed_id, route.rss_feeds?.name ?? "RSS feed"] as const),
  );
  return items
    .filter((item) => {
      const resurfacedAt = lastResurfacedAtByItem.get(item.id);
      return !isRssItemActive({
        firstSeenAt: item.first_seen_at,
        resurfacedAt,
        resurfaceWindowStart,
        windowStart: before,
      });
    })
    .map((item) => {
      const opportunity = item.source_document_id
        ? opportunityBySource.get(item.source_document_id)
        : undefined;
      return {
        itemId: item.id,
        feedName: feedNameById.get(item.rss_feed_id) ?? "RSS feed",
        title: item.title,
        firstSeenAt: item.first_seen_at,
        opportunityId: opportunity?.id ?? null,
        score: opportunity ? Number(opportunity.opportunity_score) : null,
        opportunityStatus: opportunity?.status ?? null,
        postStatuses: opportunity
          ? [...(postStatusesByOpportunity.get(opportunity.id) ?? [])].sort()
          : [],
        lastResurfacedAt: lastResurfacedAtByItem.get(item.id) ?? null,
      };
    });
}
