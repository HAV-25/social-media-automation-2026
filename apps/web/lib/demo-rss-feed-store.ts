import { z } from "zod";

const demoRssRouteSchema = z.object({
  brandId: z.uuid(),
  generationPolicy: z.enum(["ingest_only", "score_then_research"]),
  minimumScore: z.number().min(60).max(100),
  dailyGenerationLimit: z.number().int().min(0).max(100),
  topicTags: z.array(z.string()).max(30),
  includeKeywords: z.array(z.string()).max(50),
  excludeKeywords: z.array(z.string()).max(50),
});

export const demoRssFeedSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(200),
  feedUrl: z.url(),
  topicTags: z.array(z.string()).max(30),
  authorityScore: z.number().min(0).max(100),
  active: z.boolean(),
  brandRoutes: z.array(demoRssRouteSchema).min(1).max(50),
  lastPolledAt: z.iso.datetime().nullable(),
  lastSuccessAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type DemoRssFeed = z.infer<typeof demoRssFeedSchema>;

const recordsSchema = z.array(demoRssFeedSchema).max(20);

export function parseDemoRssFeeds(value?: string) {
  if (!value) return [];
  try {
    const parsed = recordsSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function serializeDemoRssFeeds(records: DemoRssFeed[]) {
  return JSON.stringify(records.slice(0, 20));
}
