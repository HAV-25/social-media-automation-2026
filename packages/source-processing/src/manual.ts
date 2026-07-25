import type { OpportunityScoreBreakdown } from "@content-engine/contracts";
import { createHash } from "node:crypto";
import { load } from "cheerio";

export type PreliminaryBrandPolicy = {
  audienceDefinition: string;
  positioning: string;
  contentPillars: string[];
  restrictedTopics: string[];
};

export type NormalizedManualInput = {
  cleanText: string;
  contentHash: string;
  language: string;
  title: string;
  valueNucleus: string;
};

export type PreliminaryClassification = {
  namedEntities: string[];
  topicTags: string[];
  recommendedStyle: "newsworthy_authority" | "educational_breakdown" | "perspective_conversation";
  reasons: string[];
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, maximum: number) {
  return round(Math.max(0, Math.min(maximum, value)));
}

function normalizedTerms(values: string[]) {
  return [
    ...new Set(
      values
        .flatMap((value) => value.toLocaleLowerCase("en").split(/[^\p{L}\p{N}]+/u))
        .filter((term) => term.length >= 4),
    ),
  ];
}

function termMatches(text: string, terms: string[]) {
  return terms.filter((term) => text.includes(term)).length;
}

function removeUnsafeFormattingCharacters(value: string) {
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      const disallowedControl =
        codePoint <= 8 ||
        (codePoint >= 11 && codePoint <= 12) ||
        (codePoint >= 14 && codePoint <= 31);
      const disallowedInvisible =
        codePoint === 127 ||
        (codePoint >= 0x200b && codePoint <= 0x200d) ||
        codePoint === 0x2060 ||
        codePoint === 0xfeff;
      return !disallowedControl && !disallowedInvisible;
    })
    .join("");
}

export function normalizeManualInput({
  language,
  stripMarkup = false,
  text,
  title,
}: {
  language: string;
  stripMarkup?: boolean;
  text: string;
  title: string;
}): NormalizedManualInput {
  let sourceText = text;
  if (stripMarkup) {
    const markup = load(text, null, false);
    markup("br").replaceWith("\n");
    markup("p,div,li,article,section,h1,h2,h3,h4,h5,h6").append("\n");
    sourceText = markup.root().text();
  }
  const cleanText = removeUnsafeFormattingCharacters(sourceText.normalize("NFKC"))
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const normalizedTitle = title.normalize("NFKC").replace(/\s+/g, " ").trim();
  const firstSentence =
    cleanText.match(/^.{20,300}?(?:[.!?](?:\s|$)|$)/s)?.[0]?.trim() ??
    cleanText.slice(0, 300).trim();

  return {
    cleanText,
    contentHash: createHash("sha256").update(cleanText, "utf8").digest("hex"),
    language,
    title: normalizedTitle,
    valueNucleus: firstSentence,
  };
}

export function scoreManualOpportunity({
  cleanText,
  policy,
}: {
  cleanText: string;
  policy: PreliminaryBrandPolicy;
}): OpportunityScoreBreakdown {
  const lower = cleanText.toLocaleLowerCase("en");
  const words = lower.match(/\b[\p{L}\p{N}'’-]+\b/gu) ?? [];
  const sentences = cleanText.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 0);
  const policyTerms = normalizedTerms([
    policy.audienceDefinition,
    policy.positioning,
    ...policy.contentPillars,
  ]);
  const relevantTerms = termMatches(lower, policyTerms);
  const relevanceRatio = policyTerms.length === 0 ? 0 : relevantTerms / policyTerms.length;
  const usefulnessSignals = (
    lower.match(
      /\b(?:how|why|because|therefore|means|should|can|framework|lesson|step|impact)\b/g,
    ) ?? []
  ).length;
  const evidenceSignals =
    (cleanText.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? []).length +
    (cleanText.match(/https?:\/\//g) ?? []).length * 2;
  const conversationSignals =
    (cleanText.match(/\?/g) ?? []).length +
    (
      lower.match(
        /\b(?:but|however|instead|what if|the question|trade-off|tradeoff|agree|disagree)\b/g,
      ) ?? []
    ).length;
  const averageSentenceLength = words.length / Math.max(1, sentences.length);

  const dimensionValues = {
    newsOrLearningValue: clamp(6 + Math.log2(Math.max(1, words.length / 40)) * 3, 18),
    audienceRelevance: clamp(relevanceRatio * 16 + Math.min(4, relevantTerms), 16),
    consequenceOrUsefulness: clamp(4 + usefulnessSignals * 1.5, 14),
    novelty: clamp(7 + Math.min(5, (new Set(words).size / Math.max(1, words.length)) * 8), 12),
    evidenceStrength: clamp(Math.min(12, evidenceSignals * 2.25), 12),
    shareability: clamp(averageSentenceLength >= 8 && averageSentenceLength <= 26 ? 8 : 5, 10),
    conversationPotential: clamp(2 + conversationSignals * 1.5, 8),
    brandAuthorityFit: clamp(relevanceRatio * 6 + (relevantTerms > 0 ? 1 : 0), 6),
    timeliness: 2,
  };

  const restrictedMatches = policy.restrictedTopics.filter((topic) =>
    lower.includes(topic.toLocaleLowerCase("en")),
  );
  const certaintyMatches =
    lower.match(/\b(?:guaranteed|always|never fails|certain to|will definitely)\b/g) ?? [];
  const riskReasons = [
    ...restrictedMatches.map((topic) => `Restricted topic matched: ${topic}`),
    ...(certaintyMatches.length > 0 ? ["Unsupported certainty language detected."] : []),
  ];
  const riskPenalty = Math.min(30, restrictedMatches.length * 15 + certaintyMatches.length * 8);
  const grossScore = round(Object.values(dimensionValues).reduce((sum, value) => sum + value, 0));
  const finalScore = clamp(grossScore - riskPenalty, 100);
  const reason = (detail: string, score: number, maximum: number) => ({
    score,
    maximum,
    reason: detail,
  });

  return {
    contractVersion: "1.0",
    dimensions: {
      newsOrLearningValue: reason(
        `${words.length} normalized words provide the preliminary learning-value signal.`,
        dimensionValues.newsOrLearningValue,
        18,
      ),
      audienceRelevance: reason(
        `${relevantTerms} of ${policyTerms.length} brand-context terms matched.`,
        dimensionValues.audienceRelevance,
        16,
      ),
      consequenceOrUsefulness: reason(
        `${usefulnessSignals} consequence or practical-use signals detected.`,
        dimensionValues.consequenceOrUsefulness,
        14,
      ),
      novelty: reason(
        "Preliminary lexical variety only; later clustering supplies the durable novelty signal.",
        dimensionValues.novelty,
        12,
      ),
      evidenceStrength: reason(
        `${evidenceSignals} numeric or link evidence signals detected; claims remain unverified.`,
        dimensionValues.evidenceStrength,
        12,
      ),
      shareability: reason(
        `Average sentence length is ${round(averageSentenceLength)} words.`,
        dimensionValues.shareability,
        10,
      ),
      conversationPotential: reason(
        `${conversationSignals} question or contrast signals detected.`,
        dimensionValues.conversationPotential,
        8,
      ),
      brandAuthorityFit: reason(
        "Derived from explicit brand-context term overlap.",
        dimensionValues.brandAuthorityFit,
        6,
      ),
      timeliness: reason(
        "Original inputs receive a neutral preliminary timeliness score.",
        dimensionValues.timeliness,
        4,
      ),
    },
    grossScore,
    riskPenalty,
    finalScore,
    riskReasons,
  };
}

export function classifyNormalizedSource({
  cleanText,
  policy,
}: {
  cleanText: string;
  policy: PreliminaryBrandPolicy;
}): PreliminaryClassification {
  const lower = cleanText.toLocaleLowerCase("en");
  const topicTags = policy.contentPillars
    .filter((pillar) => {
      const terms = normalizedTerms([pillar]);
      return terms.length > 0 && terms.some((term) => lower.includes(term));
    })
    .slice(0, 8);
  const taxonomy: Array<[string, RegExp]> = [
    ["AI governance", /\b(?:ai governance|responsible ai|model risk)\b/i],
    ["Operating models", /\b(?:operating model|accountability|decision rights)\b/i],
    ["Leadership", /\b(?:leader|leadership|executive|board)\b/i],
    ["Innovation", /\b(?:innovation|new product|research and development)\b/i],
    ["Future of work", /\b(?:future of work|workforce|skills|jobs)\b/i],
  ];
  for (const [tag, pattern] of taxonomy) {
    if (pattern.test(cleanText) && !topicTags.includes(tag)) topicTags.push(tag);
    if (topicTags.length >= 8) break;
  }

  const entityCandidates =
    cleanText.match(
      /\b(?:[A-Z]{2,8}|[A-Z][\p{L}\p{N}&.-]+(?:\s+[A-Z][\p{L}\p{N}&.-]+){0,3})\b/gu,
    ) ?? [];
  const stopEntities = new Set([
    "A",
    "An",
    "And",
    "But",
    "For",
    "How",
    "It",
    "The",
    "This",
    "What",
    "When",
    "Why",
  ]);
  const namedEntities = [
    ...new Set(
      entityCandidates
        .map((candidate) => candidate.trim())
        .filter((candidate) => candidate.length >= 2 && !stopEntities.has(candidate)),
    ),
  ].slice(0, 20);

  const newsSignals = (
    lower.match(
      /\b(?:announc(?:e|ed|ement)|launch(?:ed)?|new|today|report(?:ed)?|study|202[0-9])\b/g,
    ) ?? []
  ).length;
  const educationSignals = (
    lower.match(/\b(?:how|why|framework|lesson|steps?|guide|because|means)\b/g) ?? []
  ).length;
  const perspectiveSignals =
    (cleanText.match(/\?/g) ?? []).length +
    (lower.match(/\b(?:but|however|instead|trade-?off|the question)\b/g) ?? []).length;
  const ranked = [
    {
      style: "newsworthy_authority" as const,
      score: newsSignals,
      reason: `${newsSignals} time-sensitive or reporting signals`,
    },
    {
      style: "educational_breakdown" as const,
      score: educationSignals,
      reason: `${educationSignals} explanatory or practical signals`,
    },
    {
      style: "perspective_conversation" as const,
      score: perspectiveSignals,
      reason: `${perspectiveSignals} question or contrast signals`,
    },
  ].sort((left, right) => right.score - left.score);
  const winner =
    ranked[0] && ranked[0].score > 0
      ? ranked[0]
      : {
          style: "perspective_conversation" as const,
          score: 0,
          reason: "No dominant news or teaching signal; defaulted to perspective",
        };

  return {
    namedEntities,
    topicTags,
    recommendedStyle: winner.style,
    reasons: [winner.reason, `${namedEntities.length} named-entity candidates extracted`],
  };
}
