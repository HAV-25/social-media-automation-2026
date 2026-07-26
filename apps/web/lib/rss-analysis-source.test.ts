import {
  sourceAdapterFailureResultSchema,
  sourceAdapterNormalizedResultSchema,
} from "@content-engine/contracts";
import { describe, expect, it } from "vitest";
import {
  RSS_FULL_ARTICLE_MINIMUM_CHARACTERS,
  RSS_SUMMARY_REVIEW_REASON,
  selectRssAnalysisSource,
} from "./rss-analysis-source";

const source = {
  title: "Robotics deployment update",
  rawText: "A short RSS summary about a new commercial robotics deployment.",
  canonicalUrl: "https://example.com/robotics",
  author: "Reporter",
  publisher: "Example",
  publishedAt: "2026-07-26T08:00:00.000Z",
};

describe("RSS analysis source selection", () => {
  it("uses safely extracted full article text for scoring and automatic preparation", () => {
    const text = `Commercial robotics evidence. ${"Deployment requirements and measured operational results. ".repeat(12)}`;
    const result = selectRssAnalysisSource({
      source,
      actorId: "50862c0b-8acd-4e98-a82c-a2838f80bd75",
      requestedAt: "2026-07-26T09:00:00.000Z",
      extracted: sourceAdapterNormalizedResultSchema.parse({
        contractVersion: "1.0",
        outcome: "normalized",
        sourceType: "url",
        title: source.title,
        cleanText: text,
        contentHash: "a".repeat(64),
        language: "en",
        canonicalUrl: source.canonicalUrl,
        sections: [{ index: 0, label: "Article", text }],
        requiresManualReview: false,
        reviewReasons: [],
        provenance: {
          submittedBy: "50862c0b-8acd-4e98-a82c-a2838f80bd75",
          originalUrl: source.canonicalUrl,
          finalUrl: source.canonicalUrl,
          receivedAt: "2026-07-26T09:00:00.000Z",
        },
      }),
    });

    expect(text.length).toBeGreaterThanOrEqual(RSS_FULL_ARTICLE_MINIMUM_CHARACTERS);
    expect(result.analysisBasis).toBe("full_article");
    expect(result.automaticPreparationAllowed).toBe(true);
    expect(result.source.cleanText).toContain("measured operational results");
    expect(result.source.requiresManualReview).toBe(false);
  });

  it("stores summary-only scoring for review without automatic preparation", () => {
    const result = selectRssAnalysisSource({
      source,
      actorId: "50862c0b-8acd-4e98-a82c-a2838f80bd75",
      requestedAt: "2026-07-26T09:00:00.000Z",
      extracted: sourceAdapterFailureResultSchema.parse({
        contractVersion: "1.0",
        outcome: "failure",
        sourceType: "url",
        code: "fetch_failed",
        message: "Publisher denied extraction.",
        retryable: false,
        provenance: {
          submittedBy: "50862c0b-8acd-4e98-a82c-a2838f80bd75",
          originalUrl: source.canonicalUrl,
          receivedAt: "2026-07-26T09:00:00.000Z",
        },
      }),
    });

    expect(result.analysisBasis).toBe("rss_summary");
    expect(result.automaticPreparationAllowed).toBe(false);
    expect(result.source.requiresManualReview).toBe(true);
    expect(result.source.reviewReasons).toEqual([RSS_SUMMARY_REVIEW_REASON]);
  });
});
