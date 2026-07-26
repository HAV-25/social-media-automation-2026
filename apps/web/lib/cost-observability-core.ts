import { z } from "zod";

const costNumberSchema = z.coerce.number().finite().nonnegative().max(1_000_000);
const countSchema = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

const keyedCostBreakdownSchema = z
  .object({
    key: z.string().trim().min(1).max(200),
    runCount: countSchema,
    paidRunCount: countSchema,
    costUsd: costNumberSchema,
  })
  .passthrough();

const tokenCostBreakdownSchema = keyedCostBreakdownSchema.extend({
  inputTokens: countSchema,
  outputTokens: countSchema,
});

export const brandAiCostObservabilitySchema = z
  .object({
    brandId: z.uuid(),
    windowStart: z.iso.datetime({ offset: true }).nullable(),
    totalCostUsd: costNumberSchema,
    aiRunCount: countSchema,
    paidRunCount: countSchema,
    inputTokens: countSchema,
    outputTokens: countSchema,
    webSearchCalls: countSchema,
    generatedImages: countSchema,
    byStage: z.array(
      tokenCostBreakdownSchema.extend({
        webSearchCalls: countSchema,
      }),
    ),
    byModel: z.array(tokenCostBreakdownSchema),
    bySourceType: z.array(keyedCostBreakdownSchema),
    byPackage: z.array(
      z
        .object({
          opportunityId: z.uuid(),
          sourceTitle: z.string().trim().min(1).max(1_000),
          sourceType: z.string().trim().min(1).max(100),
          runCount: countSchema,
          paidRunCount: countSchema,
          costUsd: costNumberSchema,
          inputTokens: countSchema,
          outputTokens: countSchema,
          draftCount: countSchema,
          reviewReadyCount: countSchema,
          approvedCount: countSchema,
        })
        .strict(),
    ),
  })
  .strict();

export type BrandAiCostObservability = z.infer<typeof brandAiCostObservabilitySchema>;

const stageLabels: Record<string, string> = {
  research: "Research & verification",
  post_generation: "Post writing",
  editorial_generation: "Editorial orchestration",
  post_regeneration: "Selective regeneration",
  image_generation: "Image creation",
  image_direction: "Visual direction",
};

const sourceTypeLabels: Record<string, string> = {
  rss: "RSS articles",
  url: "Submitted URLs",
  pdf: "PDF documents",
  transcript: "Transcripts",
  social_content: "Pasted social content",
  plain_text: "Plain text",
  unattributed: "Not linked to a source",
};

export function costStageLabel(key: string) {
  return stageLabels[key] ?? key.replaceAll("_", " ");
}

export function costSourceTypeLabel(key: string) {
  return sourceTypeLabels[key] ?? key.replaceAll("_", " ");
}

export function formatRecordedCost(costUsd: number) {
  if (costUsd === 0) return "$0.0000";
  if (costUsd < 0.0001) return "<$0.0001";
  return `$${costUsd.toFixed(4)}`;
}

export function emptyBrandAiCostObservability(
  brandId: string,
  windowStart: string | null,
): BrandAiCostObservability {
  return brandAiCostObservabilitySchema.parse({
    brandId,
    windowStart,
    totalCostUsd: 0,
    aiRunCount: 0,
    paidRunCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    webSearchCalls: 0,
    generatedImages: 0,
    byStage: [],
    byModel: [],
    bySourceType: [],
    byPackage: [],
  });
}
