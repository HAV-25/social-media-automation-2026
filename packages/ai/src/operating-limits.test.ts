import type { NormalizedBrandContext } from "@content-engine/brand-memory";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  buildLeanResearchPlan,
  FakeEditorialProvider,
  FakeImageDirector,
  FakeImageProvider,
  FakeResearchProvider,
  generateEditorialDraftBatch,
} from "./index";

const styles = [
  "newsworthy_authority",
  "educational_breakdown",
  "perspective_conversation",
] as const;

function brandContext(index: number): NormalizedBrandContext {
  return {
    contractVersion: "1.0",
    brandId: `brand-${index}`,
    identity: {
      name: `Internal brand ${index}`,
      description: "A bounded Phase 1 capacity-test brand.",
      website: "https://example.test",
      audience: "Business decision makers",
      positioning: "Evidence-led operating guidance",
    },
    editorialPolicy: {
      contentPillars: ["robotics", "artificial intelligence"],
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
}

function opportunityId(index: number) {
  return `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  let active = 0;
  let maximumActive = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        try {
          results[index] = await operation(values[index]!);
        } finally {
          active -= 1;
        }
      }
    }),
  );
  return { results, maximumActive };
}

describe("Phase 1 fake-provider operating limits", () => {
  it("prepares the 20-brand daily maximum without paid calls or unbounded concurrency", async () => {
    const researchProvider = new FakeResearchProvider();
    const editorialProvider = new FakeEditorialProvider();
    const opportunities = Array.from({ length: 60 }, (_, index) => ({
      index,
      brand: brandContext(index % 20),
      opportunityId: opportunityId(index + 1),
      title: `Robotics operating signal ${index + 1}`,
      nucleus: `A verified robotics operating signal ${index + 1} may change a business decision.`,
    }));
    const startedAt = performance.now();
    const { results, maximumActive } = await mapWithConcurrency(
      opportunities,
      4,
      async (opportunity) => {
        const sourceText = `${opportunity.nucleus} The submitted source provides bounded context.`;
        const research = await researchProvider.research({
          plan: buildLeanResearchPlan({
            opportunityId: opportunity.opportunityId,
            sourceTitle: opportunity.title,
            valueNucleus: opportunity.nucleus,
            budget: {
              maxQueries: 1,
              maxDomains: 4,
              maxResults: 5,
              maxElapsedMs: 10_000,
              maxOutputTokens: 1_500,
              maxCostUsd: 1,
            },
          }),
          sourceTitle: opportunity.title,
          sourceText,
          originalSourceUrl: `https://example.test/opportunities/${opportunity.index}`,
        });
        const drafts = await generateEditorialDraftBatch(
          editorialProvider,
          styles.map((contentStyle) => ({
            opportunityId: opportunity.opportunityId,
            sourceTitle: opportunity.title,
            valueNucleus: opportunity.nucleus,
            contentStyle,
            tone: "thoughtful" as const,
            brandContext: opportunity.brand,
            evidencePackage: research.evidencePackage,
            sourceText,
          })),
        );
        return { research, drafts };
      },
    );
    const elapsedMs = performance.now() - startedAt;

    expect(maximumActive).toBe(4);
    expect(results).toHaveLength(60);
    expect(results.flatMap((result) => result.drafts)).toHaveLength(180);
    expect(results.every((result) => result.research.usage.estimatedCostUsd === 0)).toBe(true);
    expect(
      results
        .flatMap((result) => result.drafts)
        .every((draft) => draft.model === "fake-editorial-v1"),
    ).toBe(true);
    expect(elapsedMs).toBeLessThan(10_000);
  }, 15_000);

  it("bounds concurrent fake image jobs to the documented four-preset ceiling", async () => {
    const brand = brandContext(1);
    const direction = await new FakeImageDirector().direct({
      postDraftId: "post-operating-limit",
      postText: "Robotics adoption changes when operating decisions change.",
      valueNucleus: "Operating design matters more than isolated automation.",
      preferredStyle: "editorial_hero",
      brandContext: brand,
    });
    const provider = new FakeImageProvider({
      brandName: brand.identity.name,
      primaryColor: "#173D32",
      secondaryColor: "#EAE3D7",
      accentColor: "#D84B2A",
    });
    const jobs = Array.from({ length: 4 }, (_, index) => ({
      concept: direction.concepts[index % direction.concepts.length]!,
      idempotencyKey: `operating-limit-image-${index + 1}`,
    }));
    const startedAt = performance.now();
    const { results, maximumActive } = await mapWithConcurrency(jobs, 4, (job) =>
      provider.generate(job),
    );
    const elapsedMs = performance.now() - startedAt;

    expect(maximumActive).toBe(4);
    expect(results).toHaveLength(4);
    expect(results.every((result) => result.usage.estimatedCostUsd === 0)).toBe(true);
    expect(results.reduce((sum, result) => sum + result.imageBase64.length, 0)).toBeLessThan(
      50_000_000,
    );
    expect(elapsedMs).toBeLessThan(15_000);
  }, 20_000);
});
