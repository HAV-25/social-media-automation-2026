import { describe, expect, it } from "vitest";
import {
  clusterComparableSources,
  defaultSimilarityConfig,
  evaluateDuplicate,
  jaccardSimilarity,
  type ComparableSource,
} from "./deduplication";

function source(id: string, title: string, text: string): ComparableSource {
  return { id, title, cleanText: text, contentHash: id.padEnd(64, "0") };
}

describe("deterministic deduplication and clustering", () => {
  it("matches exact hash and canonical URL before fuzzy comparisons", () => {
    const first = {
      ...source("1", "First report", "Original source body"),
      canonicalUrl: "https://example.test/report",
    };
    expect(evaluateDuplicate(first, { ...first, id: "2" }).kind).toBe("exact_hash");
    expect(
      evaluateDuplicate(
        { ...source("3", "Changed title", "Changed body"), canonicalUrl: first.canonicalUrl },
        first,
      ).kind,
    ).toBe("exact_url");
  });

  it("honors the configured near-duplicate threshold boundary", () => {
    const first = source(
      "1",
      "AI governance changes accountable decisions",
      "Teams redesign accountable decisions with evidence and measure consequences after deployment.",
    );
    const second = source(
      "2",
      "AI governance changes accountable decisions",
      "Teams redesign accountable decisions with evidence and measure consequences after deployment today.",
    );
    const similarity = jaccardSimilarity(first.cleanText, second.cleanText, 2);
    expect(
      evaluateDuplicate(first, second, {
        ...defaultSimilarityConfig,
        textThreshold: similarity,
      }).duplicate,
    ).toBe(true);
    expect(
      evaluateDuplicate(first, second, {
        ...defaultSimilarityConfig,
        textThreshold: similarity + 0.0001,
      }).duplicate,
    ).toBe(false);
  });

  it("clusters five reports about one event while leaving another event separate", () => {
    const sharedText =
      "The council approved an accountable AI operating model requiring evidence, named decision owners, and consequence measurement.";
    const reports = Array.from({ length: 5 }, (_, index) =>
      source(
        String(index + 1),
        `Council approves accountable AI operating model report ${index + 1}`,
        `${sharedText} Publisher ${index + 1} added local context.`,
      ),
    );
    const unrelated = source(
      "9",
      "New battery plant opens in Bremen",
      "A manufacturer opened a battery plant and announced logistics hiring targets.",
    );

    const clusters = clusterComparableSources([...reports, unrelated]);
    expect(clusters.map((cluster) => cluster.memberIds.length).sort()).toEqual([1, 5]);
    expect(clusters.find((cluster) => cluster.memberIds.length === 5)?.representativeId).toBe("1");
  });
});
