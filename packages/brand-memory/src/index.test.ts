import { describe, expect, it } from "vitest";
import {
  FakeEmbeddingProvider,
  OpenAIEmbeddingProvider,
  brandAssetMetadataSchema,
  brandProfileInputSchema,
  buildNormalizedBrandContext,
  defaultOpportunitySelectionPolicy,
  opportunitySelectionPolicySchema,
  selectRelevantExamples,
  validateBrandAssetBytes,
  type BrandContextInput,
} from "./index";

const baseContext: BrandContextInput = {
  brandId: "brand-a",
  brandName: "Business of AI",
  brandDescription: "Practical AI operating insight.",
  website: "https://example.com",
  profile: {
    audienceDefinition: "Business leaders implementing AI.",
    positioning: "Evidence-led operating guidance.",
    contentPillars: ["AI operations"],
    restrictedTopics: ["Unverified forecasts"],
    ctaPreferences: ["Ask a thoughtful question"],
    geographicFocus: ["Global"],
    riskTolerance: "low",
    voiceSettings: {
      formality: 65,
      warmth: 45,
      boldness: 55,
      humor: 10,
      evidenceDensity: 90,
      sentenceStyle: "crisp",
      preferredVocabulary: ["operating model"],
      avoidVocabulary: ["game-changing"],
      bannedPhrases: ["guaranteed viral"],
    },
    generationDefaults: {
      targetLength: "medium",
      emojiPolicy: "never",
      hashtagPolicy: "none",
      ctaStyle: "question",
      defaultVariantCount: 3,
    },
  },
  examples: [],
  assets: [],
};

describe("brand memory", () => {
  it("bounds the brand-wide automatic opportunity policy", () => {
    expect(opportunitySelectionPolicySchema.parse(defaultOpportunitySelectionPolicy)).toEqual({
      automaticSelection: true,
      minimumScore: 72,
      dailyDraftLimit: 3,
    });
    expect(
      opportunitySelectionPolicySchema.safeParse({
        automaticSelection: true,
        minimumScore: 101,
        dailyDraftLimit: 21,
      }).success,
    ).toBe(false);
  });

  it("validates profile bounds and upload MIME/size", () => {
    expect(
      brandProfileInputSchema.safeParse({
        ...baseContext.profile,
        name: "Business of AI",
        slug: "Business Of AI",
        description: "",
        website: "",
        defaultLanguage: "en",
      }).success,
    ).toBe(false);

    expect(
      brandAssetMetadataSchema.safeParse({
        assetType: "logo",
        originalName: "logo.exe",
        mimeType: "application/octet-stream",
        byteSize: 100,
        altText: "",
        dominantColors: [],
      }).success,
    ).toBe(false);
  });

  it("checks asset bytes instead of trusting the browser MIME declaration", () => {
    const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const metadata = brandAssetMetadataSchema.parse({
      assetType: "logo",
      originalName: "logo.png",
      mimeType: "image/png",
      byteSize: validPng.byteLength,
      altText: "Logo",
      dominantColors: ["#214D3B"],
    });

    expect(() => validateBrandAssetBytes(metadata, validPng)).not.toThrow();
    expect(() =>
      validateBrandAssetBytes(metadata, new TextEncoder().encode("<script>alert(1)</script>")),
    ).toThrow();
  });

  it("rejects active content in SVG visual assets", () => {
    const activeSvg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const metadata = brandAssetMetadataSchema.parse({
      assetType: "logo",
      originalName: "logo.svg",
      mimeType: "image/svg+xml",
      byteSize: activeSvg.byteLength,
      altText: "Logo",
      dominantColors: [],
    });

    expect(() => validateBrandAssetBytes(metadata, activeSvg)).toThrow(
      "SVG asset contains unsupported or active content.",
    );
  });

  it("selects at most three approved examples for normalized context", () => {
    const context = buildNormalizedBrandContext({
      ...baseContext,
      examples: Array.from({ length: 6 }, (_, index) => ({
        id: `example-${index}`,
        brandId: "brand-a",
        exampleType: index === 5 ? "high_performing" : "positive",
        content: `A complete approved reference example number ${index}.`,
        performanceNotes: "",
        approved: index !== 0,
        createdAt: `2026-07-${String(index + 10).padStart(2, "0")}T00:00:00.000Z`,
      })),
    });

    expect(context.selectedExamples).toHaveLength(3);
    expect(context.selectedExamples[0]?.id).toBe("example-5");
    expect(context.selectedExamples.some((example) => example.id === "example-0")).toBe(false);
  });

  it("creates deterministic fake embeddings and prevents cross-brand retrieval", async () => {
    const provider = new FakeEmbeddingProvider(8);
    const query = await provider.embed("AI operating model");
    const same = await provider.embed("AI operating model");
    expect(query.values).toEqual(same.values);

    const results = selectRelevantExamples({
      brandId: "brand-a",
      queryEmbedding: query.values,
      examples: [
        {
          id: "same-brand",
          brandId: "brand-a",
          exampleType: "positive",
          content: "A complete approved example.",
          performanceNotes: "",
          approved: true,
          createdAt: "2026-07-23T00:00:00.000Z",
          embedding: query.values,
        },
        {
          id: "other-brand",
          brandId: "brand-b",
          exampleType: "positive",
          content: "A complete cross-brand example.",
          performanceNotes: "",
          approved: true,
          createdAt: "2026-07-23T00:00:00.000Z",
          embedding: query.values,
        },
      ],
    });

    expect(results.map(({ example }) => example.id)).toEqual(["same-brand"]);
  });

  it("produces observably different context for different brand profiles", () => {
    const first = buildNormalizedBrandContext(baseContext);
    const second = buildNormalizedBrandContext({
      ...baseContext,
      brandId: "brand-b",
      brandName: "Wyngs",
      profile: {
        ...baseContext.profile,
        audienceDefinition: "Creative founders searching for momentum.",
        positioning: "Energetic, optimistic founder storytelling.",
        riskTolerance: "high",
        voiceSettings: {
          ...baseContext.profile.voiceSettings,
          warmth: 90,
          boldness: 90,
          evidenceDensity: 40,
        },
      },
    });

    expect(first.identity.positioning).not.toBe(second.identity.positioning);
    expect(first.voice).not.toEqual(second.voice);
    expect(first.editorialPolicy.riskTolerance).not.toBe(second.editorialPolicy.riskTolerance);
  });

  it("validates the external embedding provider response", async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          model: "text-embedding-3-small",
          usage: { total_tokens: 7 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const provider = new OpenAIEmbeddingProvider("test-key", undefined, fetcher);

    await expect(provider.embed("example")).resolves.toEqual({
      model: "text-embedding-3-small",
      values: [0.1, 0.2, 0.3],
      usageTokens: 7,
    });
  });
});
