import type { NormalizedBrandContext } from "@content-engine/brand-memory";
import { evidencePackageSchema } from "@content-engine/contracts";
import { describe, expect, it } from "vitest";
import {
  editorialSimilarity,
  evaluateEditorialDraft,
  selectivelyRegeneratePost,
} from "./editorial";

const brandContext: NormalizedBrandContext = {
  contractVersion: "1.0",
  brandId: "brand-a",
  identity: {
    name: "Klaank",
    description: "",
    website: "",
    audience: "operators building better organizations",
    positioning: "clear organizational thinking",
  },
  editorialPolicy: {
    contentPillars: ["organizations"],
    restrictedTopics: ["confidential acquisition"],
    ctaPreferences: [],
    geographicFocus: ["Global"],
    riskTolerance: "low",
  },
  voice: {
    formality: 60,
    warmth: 55,
    boldness: 50,
    humor: 10,
    evidenceDensity: 90,
    sentenceStyle: "crisp",
    preferredVocabulary: ["operating model"],
    avoidVocabulary: [],
    bannedPhrases: ["guaranteed viral"],
  },
  generation: {
    targetLength: "medium",
    emojiPolicy: "never",
    hashtagPolicy: "none",
    ctaStyle: "question",
    defaultVariantCount: 3,
  },
  selectedExamples: [],
  visualAssets: [],
  completeness: { score: 80, missing: [] },
};

const evidence = evidencePackageSchema.parse({
  contractVersion: "1.0",
  opportunityId: "00000000-0000-4000-8000-000000000001",
  summary: "A primary source supports the operating-model claim for deterministic evaluation.",
  sources: [
    {
      sourceKey: "source_primary1",
      url: "https://example.test/report",
      title: "Operating model report",
      publisher: "Example Institute",
      publishedAt: null,
      retrievedAt: "2026-07-23T10:00:00.000Z",
      sourceType: "primary_document",
      authorityScore: 90,
      relevantExcerpt: "The operating model changes the decision path.",
    },
  ],
  claims: [
    {
      claimKey: "claim_primary1",
      text: "The operating model changes the decision path",
      claimType: "factual",
      importance: "core",
      riskLevel: "low",
      verificationState: "verified",
      confidence: 0.9,
      evidence: [
        {
          sourceKey: "source_primary1",
          supportType: "supports",
          excerpt: "The operating model changes the decision path.",
          locator: "Page 2",
        },
      ],
      usageGuidance: "safe",
      caveat: null,
    },
  ],
  conflicts: [],
  caveats: [],
  readyForWriting: true,
});

describe("deterministic editorial evaluation", () => {
  it("blocks unsupported numerical claims and prohibited language", () => {
    const content = {
      hook: "A guaranteed viral operating model",
      body: "The operating model changes the decision path. Results improved by 87%.",
      closing: "What changes next?",
      fullText:
        "A guaranteed viral operating model\n\nThe operating model changes the decision path. Results improved by 87%.\n\nWhat changes next?",
    };
    const evaluation = evaluateEditorialDraft({
      content,
      brandContext,
      evidence,
      sourceText: "The operating model changes the decision path.",
    });
    expect(evaluation.prohibitedPhrases).toContain("guaranteed viral");
    expect(evaluation.sentenceClaims.some((mapping) => mapping.state === "unsupported")).toBe(true);
    expect(evaluation.readyForReview).toBe(false);
  });

  it("preserves untouched components during selective regeneration", () => {
    const content = {
      hook: "Original hook",
      body: "Original body",
      closing: "Original closing",
      fullText: "Original hook\n\nOriginal body\n\nOriginal closing",
    };
    const regenerated = selectivelyRegeneratePost({
      content,
      request: { component: "hook", instruction: "Turn it into a question" },
      valueNucleus: "Decision design changes outcomes.",
    });
    expect(regenerated.hook).not.toBe(content.hook);
    expect(regenerated.body).toBe(content.body);
    expect(regenerated.closing).toBe(content.closing);
  });

  it("calculates deterministic bounded similarity", () => {
    expect(editorialSimilarity("one useful operating model", "one useful operating model")).toBe(1);
    expect(editorialSimilarity("one useful operating model", "completely different topic")).toBe(0);
  });
});
