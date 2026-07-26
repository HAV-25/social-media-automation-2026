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

  it("warns without blocking when a draft avoids materially conflicted claims", () => {
    const conflictedEvidence = evidencePackageSchema.parse({
      ...evidence,
      claims: [
        ...evidence.claims,
        {
          ...evidence.claims[0],
          claimKey: "claim_conflicted1",
          text: "The operating model guarantees every decision will improve",
          verificationState: "disputed",
          usageGuidance: "do_not_use",
        },
      ],
      conflicts: [
        {
          conflictKey: "conflict_material1",
          claimKeys: ["claim_conflicted1"],
          description: "The broad guarantee conflicts with the primary evidence.",
          resolution: "Do not use the broad guarantee.",
          material: true,
        },
      ],
    });
    const content = {
      hook: "Clear organizational thinking starts with the operating model",
      body: "For operators building better organizations, the operating model changes the decision path.",
      closing: "What changes next?",
      fullText:
        "Clear organizational thinking starts with the operating model\n\nFor operators building better organizations, the operating model changes the decision path.\n\nWhat changes next?",
    };

    const evaluation = evaluateEditorialDraft({
      content,
      brandContext,
      evidence: conflictedEvidence,
      sourceText: "A different source description.",
    });

    expect(evaluation.contradictions).toBe(0);
    expect(evaluation.warnings).toContain(
      "The evidence ledger contains a material conflict; the draft avoids its claims.",
    );
    expect(evaluation.readyForReview).toBe(true);
  });

  it("blocks a draft that relies on a materially conflicted claim", () => {
    const conflictedEvidence = evidencePackageSchema.parse({
      ...evidence,
      conflicts: [
        {
          conflictKey: "conflict_material1",
          claimKeys: ["claim_primary1"],
          description: "The primary claim has conflicting evidence.",
          resolution: "Do not rely on the claim until the conflict is resolved.",
          material: true,
        },
      ],
    });
    const content = {
      hook: "A clearer operating model",
      body: "The operating model changes the decision path.",
      closing: "What changes next?",
      fullText:
        "A clearer operating model\n\nThe operating model changes the decision path.\n\nWhat changes next?",
    };

    const evaluation = evaluateEditorialDraft({
      content,
      brandContext,
      evidence: conflictedEvidence,
      sourceText: "A different source description.",
    });

    expect(evaluation.contradictions).toBe(1);
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

  it("can replace a hook with a verified ledger claim", () => {
    const content = {
      hook: "Original hook",
      body: "Original body",
      closing: "Original closing",
      fullText: "Original hook\n\nOriginal body\n\nOriginal closing",
    };
    const verifiedClaim =
      "IEEE Spectrum featured Generative Bionics' GENE.01 humanoid in Video Friday.";
    const regenerated = selectivelyRegeneratePost({
      content,
      request: {
        component: "hook",
        instruction: "Use the exact verified core claim as the hook.",
      },
      valueNucleus: "Decision design changes outcomes.",
      verifiedClaim,
    });
    expect(regenerated.hook).toBe(verifiedClaim);
    expect(regenerated.body).toBe(content.body);
    expect(regenerated.closing).toBe(content.closing);
  });

  it("calculates deterministic bounded similarity", () => {
    expect(editorialSimilarity("one useful operating model", "one useful operating model")).toBe(1);
    expect(editorialSimilarity("one useful operating model", "completely different topic")).toBe(0);
  });
});
