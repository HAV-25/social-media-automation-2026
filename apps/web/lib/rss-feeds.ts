import { cookies } from "next/headers";
import { z } from "zod";
import { parseDemoRssFeeds } from "./demo-rss-feed-store";
import { createSupabaseServerClient } from "./supabase/server";

export type RssFeedView = {
  id: string;
  name: string;
  feedUrl: string;
  topicTags: string[];
  authorityScore: number;
  active: boolean;
  lastPolledAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  brandRoutes: Array<{
    brandId: string;
    generationPolicy: "ingest_only" | "score_then_research";
    minimumScore: number;
    dailyGenerationLimit: number;
    topicTags: string[];
    includeKeywords: string[];
    excludeKeywords: string[];
  }>;
};

const feedRowsSchema = z.array(
  z.object({
    id: z.uuid(),
    name: z.string(),
    feed_url: z.string(),
    topic_tags: z.array(z.string()),
    authority_score: z.union([z.number(), z.string()]),
    active: z.boolean(),
    last_polled_at: z.string().nullable(),
    last_success_at: z.string().nullable(),
    last_error: z.string().nullable(),
    consecutive_failures: z.number().int(),
    rss_feed_brand_links: z.array(
      z.object({
        brand_id: z.uuid(),
        generation_policy: z.enum(["ingest_only", "score_then_research"]),
        minimum_score: z.union([z.number(), z.string()]),
        daily_generation_limit: z.number().int(),
        topic_tags: z.array(z.string()),
        include_keywords: z.array(z.string()),
        exclude_keywords: z.array(z.string()),
      }),
    ),
  }),
);

export async function getRssFeeds(): Promise<RssFeedView[]> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const cookieStore = await cookies();
    return parseDemoRssFeeds(cookieStore.get("demo-rss-feeds")?.value).map((feed) => ({
      id: feed.id,
      name: feed.name,
      feedUrl: feed.feedUrl,
      topicTags: feed.topicTags,
      authorityScore: feed.authorityScore,
      active: feed.active,
      lastPolledAt: feed.lastPolledAt,
      lastSuccessAt: feed.lastSuccessAt,
      lastError: feed.lastError,
      consecutiveFailures: feed.consecutiveFailures,
      brandRoutes: feed.brandRoutes,
    }));
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("rss_feeds")
    .select(
      "id,name,feed_url,topic_tags,authority_score,active,last_polled_at,last_success_at,last_error,consecutive_failures,rss_feed_brand_links(brand_id,generation_policy,minimum_score,daily_generation_limit,topic_tags,include_keywords,exclude_keywords)",
    )
    .order("name");
  if (error) throw new Error(`Unable to load RSS feeds: ${error.message}`);
  return feedRowsSchema.parse(data ?? []).map((feed) => ({
    id: feed.id,
    name: feed.name,
    feedUrl: feed.feed_url,
    topicTags: feed.topic_tags,
    authorityScore: Number(feed.authority_score),
    active: feed.active,
    lastPolledAt: feed.last_polled_at,
    lastSuccessAt: feed.last_success_at,
    lastError: feed.last_error,
    consecutiveFailures: feed.consecutive_failures,
    brandRoutes: feed.rss_feed_brand_links.map((route) => ({
      brandId: route.brand_id,
      generationPolicy: route.generation_policy,
      minimumScore: Number(route.minimum_score),
      dailyGenerationLimit: route.daily_generation_limit,
      topicTags: route.topic_tags,
      includeKeywords: route.include_keywords,
      excludeKeywords: route.exclude_keywords,
    })),
  }));
}
