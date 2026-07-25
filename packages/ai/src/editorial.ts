import type { NormalizedBrandContext } from "@content-engine/brand-memory";
import {
  angleCandidateSchema,
  draftEvaluationSchema,
  postContentSchema,
  type AngleCandidate,
  type DraftEvaluation,
  type EvidencePackage,
  type PostRegenerationRequest,
  type SentenceClaimMapping,
} from "@content-engine/contracts";

const CLICHES = [
  "game changer",
  "in today's fast-paced world",
  "revolutionary",
  "unlock the power",
  "next level",
];

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string) {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length > 2),
  );
}

export function editorialSimilarity(left: string, right: string) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function rounded(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function maxSimilarity(content: string, comparisons: string[]) {
  return comparisons.reduce(
    (maximum, comparison) => Math.max(maximum, editorialSimilarity(content, comparison)),
    0,
  );
}

function splitSentences(content: string) {
  return content
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 100);
}

function includesPhrase(content: string, phrase: string) {
  return normalize(content).includes(normalize(phrase));
}

function sentenceClaimMappings(content: string, evidence: EvidencePackage): SentenceClaimMapping[] {
  return splitSentences(content).map((sentence) => {
    const ranked = evidence.claims
      .map((claim) => ({ claim, similarity: editorialSimilarity(sentence, claim.text) }))
      .sort((left, right) => right.similarity - left.similarity);
    const best = ranked[0];
    if (best && best.similarity >= 0.25) {
      const usable =
        best.claim.usageGuidance !== "do_not_use" &&
        !["unsupported", "disputed"].includes(best.claim.verificationState);
      return {
        sentence,
        claimKeys: [best.claim.claimKey],
        state:
          best.claim.claimType === "opinion" || best.claim.claimType === "interpretation"
            ? "interpretation"
            : usable
              ? "supported"
              : "unsupported",
      };
    }
    return {
      sentence,
      claimKeys: [],
      state: /\b(?:\d{2,}(?:[.,]\d+)?|\d+(?:[.,]\d+)?%)\b/.test(sentence)
        ? "unsupported"
        : "interpretation",
    };
  });
}

export function createEditorialAngles(
  valueNucleus: string,
  evidence: EvidencePackage,
): AngleCandidate[] {
  const supportingClaimKeys = evidence.claims
    .filter((claim) => claim.usageGuidance !== "do_not_use")
    .map((claim) => claim.claimKey);
  const base = evidence.readyForWriting ? 78 : 58;
  return [
    {
      angleKey: "angle_newsworthy1",
      title: "The consequential change",
      thesis: `Lead with what changed, then explain the practical consequence inside: ${valueNucleus}`,
      contentStyle: "newsworthy_authority",
      intendedReaction: "Understand why this development matters now.",
      supportingClaimKeys,
      score: Math.min(100, base + 5),
      rankExplanation: "Strongest when the evidence supports a timely, consequential change.",
    },
    {
      angleKey: "angle_educational1",
      title: "The decision framework",
      thesis: `Turn the evidence into a reusable three-part way to reason about: ${valueNucleus}`,
      contentStyle: "educational_breakdown",
      intendedReaction: "Save or apply a practical framework.",
      supportingClaimKeys,
      score: Math.min(100, base + 3),
      rankExplanation: "Converts the evidence into an actionable structure without adding facts.",
    },
    {
      angleKey: "angle_perspective1",
      title: "The less obvious shift",
      thesis: `Separate the evidence from interpretation and invite discussion about: ${valueNucleus}`,
      contentStyle: "perspective_conversation",
      intendedReaction: "Consider a defensible interpretation and respond.",
      supportingClaimKeys,
      score: base,
      rankExplanation: "Creates discussion while explicitly preserving the evidence boundary.",
    },
  ].map((angle) => angleCandidateSchema.parse(angle));
}

export function evaluateEditorialDraft(input: {
  content: { hook: string; body: string; closing: string; fullText: string };
  brandContext: NormalizedBrandContext;
  evidence: EvidencePackage;
  sourceText: string;
  recentSameBrandPosts?: string[];
  crossBrandPosts?: string[];
}): DraftEvaluation {
  const sentenceClaims = sentenceClaimMappings(input.content.fullText, input.evidence);
  const usableClaims = input.evidence.claims.filter(
    (claim) =>
      claim.usageGuidance !== "do_not_use" &&
      !["unsupported", "disputed"].includes(claim.verificationState),
  );
  const evidenceScore = Math.min(
    100,
    (input.evidence.readyForWriting ? 45 : 20) +
      (input.evidence.claims.length
        ? (usableClaims.length / input.evidence.claims.length) * 40
        : 0) +
      (sentenceClaims.some((mapping) => mapping.claimKeys.length > 0) ? 15 : 0),
  );
  const preferredHits = input.brandContext.voice.preferredVocabulary.filter((phrase) =>
    includesPhrase(input.content.fullText, phrase),
  ).length;
  const identityFit = Math.max(
    editorialSimilarity(
      input.content.fullText,
      `${input.brandContext.identity.audience} ${input.brandContext.identity.positioning}`,
    ),
    includesPhrase(input.content.fullText, input.brandContext.identity.name) ? 0.35 : 0,
  );
  const brandFitScore = Math.min(100, 60 + identityFit * 60 + Math.min(12, preferredHits * 4));
  const prohibitedPhrases = [
    ...input.brandContext.voice.bannedPhrases,
    ...input.brandContext.voice.avoidVocabulary,
  ].filter((phrase) => includesPhrase(input.content.fullText, phrase));
  const restrictedTopics = input.brandContext.editorialPolicy.restrictedTopics.filter((topic) =>
    includesPhrase(input.content.fullText, topic),
  );
  const cliches = CLICHES.filter((phrase) => includesPhrase(input.content.fullText, phrase));
  const sourceSimilarity = editorialSimilarity(input.content.fullText, input.sourceText);
  const sameBrandSimilarity = maxSimilarity(
    input.content.fullText,
    input.recentSameBrandPosts ?? [],
  );
  const crossBrandSimilarity = maxSimilarity(input.content.fullText, input.crossBrandPosts ?? []);
  const hookReuseSimilarity = maxSimilarity(
    input.content.hook,
    (input.recentSameBrandPosts ?? []).map((post) => splitSentences(post)[0] ?? post),
  );
  const unsupportedHighRiskClaims = input.evidence.claims.filter(
    (claim) =>
      claim.riskLevel === "high" &&
      claim.verificationState !== "verified" &&
      claim.usageGuidance !== "do_not_use",
  ).length;
  const contradictions = input.evidence.conflicts.filter((conflict) => conflict.material).length;
  const unsupportedSentences = sentenceClaims.filter(
    (mapping) => mapping.state === "unsupported",
  ).length;
  const warnings: string[] = [];
  if (sourceSimilarity >= 0.82) warnings.push("Draft is too similar to the source.");
  if (sameBrandSimilarity >= 0.82) warnings.push("Draft is too similar to a recent brand post.");
  if (crossBrandSimilarity >= 0.75) warnings.push("Cross-brand similarity needs review.");
  if (hookReuseSimilarity >= 0.82) warnings.push("The hook closely repeats a recent hook.");
  if (unsupportedSentences > 0) warnings.push("One or more factual sentences lack claim support.");
  if (prohibitedPhrases.length > 0) warnings.push("Draft contains prohibited brand language.");
  if (restrictedTopics.length > 0) warnings.push("Draft touches a restricted topic.");
  if (cliches.length > 0) warnings.push("Draft contains cliché language.");
  if (contradictions > 0) warnings.push("The evidence ledger contains a material conflict.");

  const qualityScore = Math.max(
    0,
    Math.min(
      100,
      evidenceScore * 0.38 +
        brandFitScore * 0.32 +
        (1 - Math.max(sourceSimilarity, sameBrandSimilarity)) * 20 +
        10 -
        warnings.length * 4,
    ),
  );
  const readyForReview =
    evidenceScore >= 70 &&
    brandFitScore >= 65 &&
    unsupportedHighRiskClaims === 0 &&
    contradictions === 0 &&
    unsupportedSentences === 0 &&
    sourceSimilarity < 0.82 &&
    sameBrandSimilarity < 0.82 &&
    prohibitedPhrases.length === 0 &&
    restrictedTopics.length === 0;

  return draftEvaluationSchema.parse({
    contractVersion: "1.0",
    evidenceScore: rounded(evidenceScore),
    brandFitScore: rounded(brandFitScore),
    qualityScore: rounded(qualityScore),
    sourceSimilarity: rounded(sourceSimilarity, 5),
    sameBrandSimilarity: rounded(sameBrandSimilarity, 5),
    crossBrandSimilarity: rounded(crossBrandSimilarity, 5),
    hookReuseSimilarity: rounded(hookReuseSimilarity, 5),
    unsupportedHighRiskClaims,
    contradictions,
    prohibitedPhrases,
    restrictedTopics,
    cliches,
    warnings,
    sentenceClaims,
    readyForReview,
  });
}

function shorten(value: string, maximum: number) {
  if (value.length <= maximum) return value;
  return `${value.slice(0, Math.max(1, maximum - 1)).trimEnd()}…`;
}

export function selectivelyRegeneratePost(input: {
  content: { hook: string; body: string; closing: string; fullText: string };
  request: Pick<PostRegenerationRequest, "component" | "instruction">;
  valueNucleus: string;
  verifiedClaim?: string;
}) {
  const instruction = normalize(input.request.instruction);
  const next = { ...input.content };
  if (input.request.component === "hook") {
    const question = instruction.includes("question");
    const useVerifiedClaim =
      Boolean(input.verifiedClaim) &&
      (instruction.includes("verified") || instruction.includes("claim"));
    next.hook = useVerifiedClaim
      ? shorten(input.verifiedClaim ?? "", 500)
      : question
        ? `What changes if we take this seriously: ${shorten(input.valueNucleus, 330)}?`
        : `The practical consequence deserves more attention: ${shorten(input.valueNucleus, 330)}`;
  } else if (input.request.component === "body") {
    const concise = instruction.includes("short") || instruction.includes("concise");
    next.body = concise
      ? `The evidence supports a careful reading of ${shorten(input.valueNucleus, 500)}. The useful next step is to separate what is known from what still needs judgment.`
      : `${input.content.body}\n\nA second lens is to separate the supported claim from the decision it may influence. That keeps the interpretation useful without overstating the evidence.`;
  } else {
    next.closing = instruction.includes("direct")
      ? "Name the decision this should change."
      : "Which part of this interpretation would you test first?";
  }
  next.fullText = [next.hook, next.body, next.closing].filter(Boolean).join("\n\n");
  return postContentSchema.parse(next);
}
