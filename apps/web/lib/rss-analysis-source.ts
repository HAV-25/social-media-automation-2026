import {
  sourceAdapterNormalizedResultSchema,
  type SourceAdapterResult,
} from "@content-engine/contracts";
import { normalizeManualInput } from "@content-engine/source-processing";

export const RSS_FULL_ARTICLE_MINIMUM_CHARACTERS = 500;
export const RSS_SUMMARY_REVIEW_REASON =
  "Full article text was unavailable. This opportunity was scored from the RSS summary and excluded from automatic preparation.";

type RssSourceInput = {
  title: string | null;
  rawText: string | null;
  canonicalUrl: string | null;
  author: string | null;
  publisher: string | null;
  publishedAt: string | null;
};

export function selectRssAnalysisSource(input: {
  source: RssSourceInput;
  actorId: string;
  requestedAt: string;
  extracted: SourceAdapterResult | null;
}) {
  const fullArticle =
    input.extracted?.outcome === "normalized" &&
    input.extracted.cleanText.length >= RSS_FULL_ARTICLE_MINIMUM_CHARACTERS
      ? input.extracted
      : null;
  const analysisBasis = fullArticle ? ("full_article" as const) : ("rss_summary" as const);
  const text = fullArticle?.cleanText ?? input.source.rawText ?? "";
  const normalized = normalizeManualInput({
    title: input.source.title ?? fullArticle?.title ?? "Untitled RSS item",
    text: [input.source.title, text].filter(Boolean).join("\n\n"),
    language: "en",
    stripMarkup: !fullArticle,
  });

  return {
    analysisBasis,
    automaticPreparationAllowed: Boolean(fullArticle),
    source: sourceAdapterNormalizedResultSchema.parse({
      contractVersion: "1.0",
      outcome: "normalized",
      sourceType: "rss",
      title: normalized.title,
      cleanText: normalized.cleanText,
      contentHash: normalized.contentHash,
      language: normalized.language,
      canonicalUrl: fullArticle?.canonicalUrl ?? input.source.canonicalUrl ?? undefined,
      sections: [
        {
          index: 0,
          label: fullArticle ? "Full article" : "RSS title and summary",
          text: normalized.cleanText,
        },
      ],
      requiresManualReview: !fullArticle,
      reviewReasons: fullArticle ? [] : [RSS_SUMMARY_REVIEW_REASON],
      provenance: {
        submittedBy: input.actorId,
        originalUrl: input.source.canonicalUrl ?? undefined,
        finalUrl: fullArticle?.provenance.finalUrl,
        author: fullArticle?.provenance.author ?? input.source.author ?? undefined,
        publisher: fullArticle?.provenance.publisher ?? input.source.publisher ?? undefined,
        publishedAt:
          fullArticle?.provenance.publishedAt ??
          (input.source.publishedAt ? new Date(input.source.publishedAt).toISOString() : undefined),
        receivedAt: input.requestedAt,
      },
    }),
  };
}
