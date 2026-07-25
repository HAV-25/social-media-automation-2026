import { describe, expect, it } from "vitest";
import {
  parseDemoRssFeeds,
  serializeDemoRssFeeds,
  type DemoRssFeed,
} from "../lib/demo-rss-feed-store";

const feed: DemoRssFeed = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "AI operations",
  feedUrl: "https://example.com/feed.xml",
  topicTags: ["AI"],
  authorityScore: 80,
  active: true,
  brandRoutes: [
    {
      brandId: "20000000-0000-4000-8000-000000000001",
      generationPolicy: "score_then_research",
      minimumScore: 72,
      dailyGenerationLimit: 3,
      topicTags: ["operations"],
      includeKeywords: ["governance"],
      excludeKeywords: ["sponsored"],
    },
  ],
  lastPolledAt: null,
  lastSuccessAt: null,
  lastError: null,
  consecutiveFailures: 0,
  createdAt: "2026-07-23T12:00:00.000Z",
};

describe("demo RSS feed persistence", () => {
  it("round-trips feed routes and generation controls", () => {
    expect(parseDemoRssFeeds(serializeDemoRssFeeds([feed]))).toEqual([feed]);
  });

  it("fails closed for malformed or oversized cookie data", () => {
    expect(parseDemoRssFeeds("not-json")).toEqual([]);
    expect(parseDemoRssFeeds(JSON.stringify([{ ...feed, authorityScore: 101 }]))).toEqual([]);
    expect(parseDemoRssFeeds(JSON.stringify(Array.from({ length: 21 }, () => feed)))).toEqual([]);
  });
});
