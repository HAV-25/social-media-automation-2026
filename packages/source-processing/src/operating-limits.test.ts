import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { clusterComparableSources, parseRssFeed, type ComparableSource } from "./index";

function feedXml(feedIndex: number, itemCount: number) {
  const items = Array.from({ length: itemCount }, (_, itemIndex) => {
    const globalIndex = feedIndex * itemCount + itemIndex;
    const marker = `marker${globalIndex.toString().padStart(4, "0")}`;
    return `<item>
      <guid>feed-${feedIndex}-item-${itemIndex}</guid>
      <title>Robotics market signal ${marker}</title>
      <link>https://example.test/feeds/${feedIndex}/items/${itemIndex}</link>
      <pubDate>Mon, 27 Jul 2026 08:00:00 GMT</pubDate>
      <description>Commercial robotics evidence ${marker} for a bounded Phase 1 capacity test.</description>
    </item>`;
  }).join("");
  return `<rss version="2.0"><channel><title>Feed ${feedIndex}</title>${items}</channel></rss>`;
}

describe("Phase 1 source operating limits", () => {
  it("parses and clusters 1,000 daily items from 100 feeds within the bounded CPU target", () => {
    const startedAt = performance.now();
    const parsed = Array.from({ length: 100 }, (_, feedIndex) =>
      parseRssFeed(feedXml(feedIndex, 10)),
    ).flat();
    const comparable: ComparableSource[] = parsed.map((item) => ({
      id: item.guid,
      canonicalUrl: item.canonicalUrl,
      contentHash: createHash("sha256")
        .update(item.summary ?? item.title)
        .digest("hex"),
      title: item.title,
      cleanText: item.summary ?? item.title,
    }));

    const clusters = clusterComparableSources(comparable);
    const elapsedMs = performance.now() - startedAt;

    expect(parsed).toHaveLength(1_000);
    expect(new Set(parsed.map((item) => item.guid))).toHaveLength(1_000);
    expect(clusters.flatMap((cluster) => cluster.memberIds)).toHaveLength(1_000);
    expect(elapsedMs).toBeLessThan(20_000);
  }, 25_000);
});
