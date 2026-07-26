import { describe, expect, it } from "vitest";
import {
  brandAiCostObservabilitySchema,
  costSourceTypeLabel,
  costStageLabel,
  emptyBrandAiCostObservability,
  formatRecordedCost,
} from "./cost-observability-core";

const brandId = "20000000-0000-4000-8000-000000000001";

describe("AI cost observability", () => {
  it("accepts the strict durable summary and coerces Postgres numerics", () => {
    const parsed = brandAiCostObservabilitySchema.parse({
      brandId,
      windowStart: "2026-07-25T18:00:00+00:00",
      totalCostUsd: "0.2314",
      aiRunCount: 6,
      paidRunCount: 5,
      inputTokens: 48_000,
      outputTokens: 6_000,
      webSearchCalls: 2,
      generatedImages: 1,
      byStage: [
        {
          key: "research",
          runCount: 1,
          paidRunCount: 1,
          costUsd: "0.1181",
          inputTokens: 22_315,
          outputTokens: 2_824,
          webSearchCalls: 2,
        },
      ],
      byModel: [],
      bySourceType: [],
      byPackage: [],
    });

    expect(parsed.totalCostUsd).toBe(0.2314);
    expect(parsed.byStage[0]?.costUsd).toBe(0.1181);
  });

  it("fails closed on negative costs and unknown response fields", () => {
    const valid = emptyBrandAiCostObservability(brandId, null);
    expect(brandAiCostObservabilitySchema.safeParse({ ...valid, totalCostUsd: -1 }).success).toBe(
      false,
    );
    expect(
      brandAiCostObservabilitySchema.safeParse({ ...valid, secretProviderPayload: "unsafe" })
        .success,
    ).toBe(false);
  });

  it("uses business-facing labels and precise small-cost formatting", () => {
    expect(costStageLabel("post_generation")).toBe("Post writing");
    expect(costSourceTypeLabel("rss")).toBe("RSS articles");
    expect(formatRecordedCost(0)).toBe("$0.0000");
    expect(formatRecordedCost(0.00001)).toBe("<$0.0001");
    expect(formatRecordedCost(0.118148)).toBe("$0.1181");
  });
});
