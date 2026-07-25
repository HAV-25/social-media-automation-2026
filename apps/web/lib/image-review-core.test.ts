import type { NormalizedBrandContext } from "@content-engine/brand-memory";
import { describe, expect, it } from "vitest";
import {
  createReviewImageDirection,
  renderReviewImage,
  selectImageConcept,
  templateForStyle,
} from "./image-review-core";

const context: NormalizedBrandContext = {
  contractVersion: "1.0",
  brandId: "brand-test",
  identity: {
    name: "Business of AI",
    description: "Practical operating insight",
    website: "https://example.test",
    audience: "Executives adopting AI",
    positioning: "Evidence-led operating guidance",
  },
  editorialPolicy: {
    contentPillars: ["AI operations"],
    restrictedTopics: [],
    ctaPreferences: [],
    geographicFocus: ["Global"],
    riskTolerance: "low",
  },
  voice: {
    formality: 70,
    warmth: 45,
    boldness: 60,
    humor: 10,
    evidenceDensity: 95,
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
  visualAssets: [
    {
      id: "asset-test",
      type: "image",
      path: "brand-test/reference.png",
      altText: "Editorial reference",
      dominantColors: ["#132B46", "#315B63", "#E7A934"],
    },
  ],
  completeness: { score: 90, missing: [] },
};

describe("post image review core", () => {
  it("changes templates without changing deterministic base art", async () => {
    const direction = createReviewImageDirection({
      directionSeed: "post-image-review-test",
      postText:
        "AI becomes useful when teams redesign decisions and keep human accountability visible.",
      valueNucleus:
        "Teams gain more from AI when they redesign decisions rather than automate isolated tasks.",
      contentStyle: "educational_breakdown",
      brandContext: context,
    });
    const common = {
      direction,
      selectedConceptKey: direction.selectedConceptKey,
      baseSeed: "image-review-base-seed-0001",
      headline: "Redesign the decision, not only the task",
      sourceLabel: "Business of AI editorial",
      brandContext: context,
    };
    const split = await renderReviewImage({ ...common, template: "insight_split" });
    const panel = await renderReviewImage({ ...common, template: "headline_panel" });
    expect(split.baseImage.equals(panel.baseImage)).toBe(true);
    expect(split.finalImage.equals(panel.finalImage)).toBe(false);
    expect(split.composition.width).toBe(1200);
    expect(split.composition.height).toBe(630);
    expect(split.validation.readyForComposition).toBe(true);
  });

  it("selects only a concept from the current ranked set", () => {
    const direction = createReviewImageDirection({
      directionSeed: "post-image-concepts-test",
      postText:
        "AI becomes useful when teams redesign decisions and keep human accountability visible.",
      valueNucleus:
        "Teams gain more from AI when they redesign decisions rather than automate isolated tasks.",
      contentStyle: "newsworthy_authority",
      brandContext: context,
    });
    const selected = selectImageConcept(direction, direction.concepts[1]!.conceptKey);
    expect(selected.selectedConceptKey).toBe(direction.concepts[1]!.conceptKey);
    expect(() => selectImageConcept(direction, "concept_missing1")).toThrow(/not available/);
    expect(templateForStyle("conceptual_illustration")).toBe("concept_frame");
  });
});
