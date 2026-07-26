import { z } from "zod";

const trimmedText = (maximum: number) => z.string().trim().max(maximum);
const vocabularyListSchema = z.array(trimmedText(80).min(1)).max(50);

export const riskToleranceSchema = z.enum(["low", "medium", "high"]);
export const exampleTypeSchema = z.enum(["positive", "negative", "high_performing"]);
export const brandAssetTypeSchema = z.enum(["logo", "font", "image", "template", "other"]);

export const voiceSettingsSchema = z.object({
  formality: z.number().int().min(0).max(100),
  warmth: z.number().int().min(0).max(100),
  boldness: z.number().int().min(0).max(100),
  humor: z.number().int().min(0).max(100),
  evidenceDensity: z.number().int().min(0).max(100),
  sentenceStyle: z.enum(["crisp", "balanced", "expansive"]),
  preferredVocabulary: vocabularyListSchema,
  avoidVocabulary: vocabularyListSchema,
  bannedPhrases: vocabularyListSchema,
});
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>;

export const generationDefaultsSchema = z.object({
  targetLength: z.enum(["short", "medium", "long"]),
  emojiPolicy: z.enum(["never", "sparingly", "natural"]),
  hashtagPolicy: z.enum(["none", "one_to_three"]),
  ctaStyle: z.enum(["none", "question", "invitation", "direct"]),
  defaultVariantCount: z.number().int().min(1).max(3),
});
export type GenerationDefaults = z.infer<typeof generationDefaultsSchema>;

export const opportunitySelectionPolicySchema = z.object({
  automaticSelection: z.boolean(),
  minimumScore: z.number().min(0).max(100),
  dailyDraftLimit: z.number().int().min(0).max(20),
});
export type OpportunitySelectionPolicy = z.infer<typeof opportunitySelectionPolicySchema>;

export const defaultVoiceSettings: VoiceSettings = {
  formality: 60,
  warmth: 55,
  boldness: 50,
  humor: 15,
  evidenceDensity: 75,
  sentenceStyle: "balanced",
  preferredVocabulary: [],
  avoidVocabulary: [],
  bannedPhrases: ["guaranteed viral"],
};

export const defaultGenerationSettings: GenerationDefaults = {
  targetLength: "medium",
  emojiPolicy: "sparingly",
  hashtagPolicy: "none",
  ctaStyle: "question",
  defaultVariantCount: 3,
};

export const defaultOpportunitySelectionPolicy: OpportunitySelectionPolicy = {
  automaticSelection: true,
  minimumScore: 72,
  dailyDraftLimit: 3,
};

export const brandProfileInputSchema = z.object({
  name: trimmedText(120).min(1),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: trimmedText(2_000),
  website: z.union([z.literal(""), z.url().max(2_048)]),
  defaultLanguage: z.string().trim().min(2).max(12),
  audienceDefinition: trimmedText(5_000),
  positioning: trimmedText(5_000),
  contentPillars: z.array(trimmedText(120).min(1)).max(20),
  restrictedTopics: z.array(trimmedText(120).min(1)).max(50),
  ctaPreferences: z.array(trimmedText(120).min(1)).max(20),
  geographicFocus: z.array(trimmedText(120).min(1)).max(20),
  riskTolerance: riskToleranceSchema,
  voiceSettings: voiceSettingsSchema,
  generationDefaults: generationDefaultsSchema,
});
export type BrandProfileInput = z.infer<typeof brandProfileInputSchema>;

export const brandExampleInputSchema = z.object({
  exampleType: exampleTypeSchema,
  content: trimmedText(20_000).min(20),
  performanceNotes: trimmedText(2_000),
  approved: z.boolean(),
});
export type BrandExampleInput = z.infer<typeof brandExampleInputSchema>;

export const brandAssetMetadataSchema = z.object({
  assetType: brandAssetTypeSchema,
  originalName: trimmedText(255).min(1),
  mimeType: z.enum([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg+xml",
    "font/ttf",
    "font/otf",
    "font/woff",
    "font/woff2",
  ]),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  altText: trimmedText(500),
  dominantColors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(12),
});
export type BrandAssetMetadata = z.infer<typeof brandAssetMetadataSchema>;

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function validateBrandAssetBytes(metadata: BrandAssetMetadata, bytes: Uint8Array): void {
  if (bytes.byteLength !== metadata.byteSize) {
    throw new Error("Asset byte length does not match declared size.");
  }

  const validBinarySignature =
    (metadata.mimeType === "image/png" &&
      startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (metadata.mimeType === "image/jpeg" && startsWith(bytes, [0xff, 0xd8, 0xff])) ||
    (metadata.mimeType === "image/webp" &&
      startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") ||
    (metadata.mimeType === "font/ttf" && startsWith(bytes, [0x00, 0x01, 0x00, 0x00])) ||
    (metadata.mimeType === "font/otf" && String.fromCharCode(...bytes.slice(0, 4)) === "OTTO") ||
    (metadata.mimeType === "font/woff" && String.fromCharCode(...bytes.slice(0, 4)) === "wOFF") ||
    (metadata.mimeType === "font/woff2" && String.fromCharCode(...bytes.slice(0, 4)) === "wOF2");

  if (metadata.mimeType === "image/svg+xml") {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
    const forbidden =
      /<!doctype|<!entity|<script|<foreignObject|\son[a-z]+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|data:|javascript:)/i;
    if (!/^<svg[\s>]/i.test(source) || forbidden.test(source)) {
      throw new Error("SVG asset contains unsupported or active content.");
    }
    return;
  }

  if (!validBinarySignature) {
    throw new Error("Asset contents do not match the declared MIME type.");
  }
}

export type StoredBrandExample = BrandExampleInput & {
  id: string;
  brandId: string;
  createdAt: string;
  embedding?: number[] | null;
};

export type StoredBrandAsset = BrandAssetMetadata & {
  id: string;
  storagePath: string;
};

export type BrandContextInput = {
  brandId: string;
  brandName: string;
  brandDescription: string;
  website: string;
  profile: Omit<BrandProfileInput, "name" | "slug" | "description" | "website" | "defaultLanguage">;
  examples: StoredBrandExample[];
  assets: StoredBrandAsset[];
};

export const normalizedBrandContextSchema = z.object({
  contractVersion: z.literal("1.0"),
  brandId: z.string().min(1),
  identity: z.object({
    name: trimmedText(120),
    description: trimmedText(2_000),
    website: z.string(),
    audience: trimmedText(5_000),
    positioning: trimmedText(5_000),
  }),
  editorialPolicy: z.object({
    contentPillars: z.array(z.string()),
    restrictedTopics: z.array(z.string()),
    ctaPreferences: z.array(z.string()),
    geographicFocus: z.array(z.string()),
    riskTolerance: riskToleranceSchema,
  }),
  voice: voiceSettingsSchema,
  generation: generationDefaultsSchema,
  selectedExamples: z
    .array(
      z.object({
        id: z.string(),
        type: exampleTypeSchema,
        content: z.string(),
        performanceNotes: z.string(),
      }),
    )
    .max(3),
  visualAssets: z
    .array(
      z.object({
        id: z.string(),
        type: brandAssetTypeSchema,
        path: z.string(),
        altText: z.string(),
        dominantColors: z.array(z.string()),
      }),
    )
    .max(12),
  completeness: z.object({
    score: z.number().int().min(0).max(100),
    missing: z.array(z.string()),
  }),
});
export type NormalizedBrandContext = z.infer<typeof normalizedBrandContextSchema>;

const examplePriority: Record<z.infer<typeof exampleTypeSchema>, number> = {
  high_performing: 0,
  positive: 1,
  negative: 2,
};

function calculateCompleteness(input: BrandContextInput) {
  const checks = [
    ["audience definition", input.profile.audienceDefinition.length > 0],
    ["positioning", input.profile.positioning.length > 0],
    ["content pillars", input.profile.contentPillars.length > 0],
    ["restricted topics", input.profile.restrictedTopics.length > 0],
    ["CTA preferences", input.profile.ctaPreferences.length > 0],
    ["geographic focus", input.profile.geographicFocus.length > 0],
    ["preferred vocabulary", input.profile.voiceSettings.preferredVocabulary.length > 0],
    [
      "vocabulary restrictions",
      input.profile.voiceSettings.avoidVocabulary.length > 0 ||
        input.profile.voiceSettings.bannedPhrases.length > 0,
    ],
    ["approved examples", input.examples.some((example) => example.approved)],
    ["logo or visual reference", input.assets.some((asset) => asset.assetType !== "font")],
    ["font", input.assets.some((asset) => asset.assetType === "font")],
  ] as const;

  const missing = checks.filter(([, complete]) => !complete).map(([label]) => label);
  return {
    score: Math.round(((checks.length - missing.length) / checks.length) * 100),
    missing,
  };
}

export function buildNormalizedBrandContext(input: BrandContextInput): NormalizedBrandContext {
  const selectedExamples = input.examples
    .filter((example) => example.approved)
    .sort(
      (left, right) =>
        examplePriority[left.exampleType] - examplePriority[right.exampleType] ||
        right.createdAt.localeCompare(left.createdAt) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, 3)
    .map((example) => ({
      id: example.id,
      type: example.exampleType,
      content: example.content,
      performanceNotes: example.performanceNotes,
    }));

  return normalizedBrandContextSchema.parse({
    contractVersion: "1.0",
    brandId: input.brandId,
    identity: {
      name: input.brandName,
      description: input.brandDescription,
      website: input.website,
      audience: input.profile.audienceDefinition,
      positioning: input.profile.positioning,
    },
    editorialPolicy: {
      contentPillars: input.profile.contentPillars,
      restrictedTopics: input.profile.restrictedTopics,
      ctaPreferences: input.profile.ctaPreferences,
      geographicFocus: input.profile.geographicFocus,
      riskTolerance: input.profile.riskTolerance,
    },
    voice: input.profile.voiceSettings,
    generation: input.profile.generationDefaults,
    selectedExamples,
    visualAssets: input.assets.slice(0, 12).map((asset) => ({
      id: asset.id,
      type: asset.assetType,
      path: asset.storagePath,
      altText: asset.altText,
      dominantColors: asset.dominantColors,
    })),
    completeness: calculateCompleteness(input),
  });
}

export type EmbeddingResult = {
  model: string;
  values: number[];
  usageTokens: number;
};

export interface EmbeddingProvider {
  embed(input: string): Promise<EmbeddingResult>;
}

export class FakeEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly dimensions = 1_536) {}

  async embed(input: string): Promise<EmbeddingResult> {
    let seed = 2_166_136_261;
    for (const character of input) {
      seed ^= character.codePointAt(0) ?? 0;
      seed = Math.imul(seed, 16_777_619) >>> 0;
    }

    const values = Array.from({ length: this.dimensions }, () => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 0xffffffff - 0.5;
    });
    const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;

    return {
      model: "fake-embedding-v1",
      values: values.map((value) => value / magnitude),
      usageTokens: Math.max(1, Math.ceil(input.length / 4)),
    };
  }
}

const openAiEmbeddingResponseSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()) })).min(1),
  model: z.string(),
  usage: z.object({ total_tokens: z.number().int().nonnegative() }),
});

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = "text-embedding-3-small",
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async embed(input: string): Promise<EmbeddingResult> {
    const response = await this.fetcher("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input,
        model: this.model,
        dimensions: 1_536,
        encoding_format: "float",
      }),
    });

    if (!response.ok) throw new Error(`Embedding provider returned HTTP ${response.status}.`);
    const parsed = openAiEmbeddingResponseSchema.parse(await response.json());
    const first = parsed.data[0];
    if (!first) throw new Error("Embedding provider returned no embedding.");
    return {
      model: parsed.model,
      values: first.embedding,
      usageTokens: parsed.usage.total_tokens,
    };
  }
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length || left.length === 0) return -1;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  return denominator === 0 ? -1 : dot / denominator;
}

export function selectRelevantExamples({
  brandId,
  examples,
  queryEmbedding,
  limit = 3,
}: {
  brandId: string;
  examples: StoredBrandExample[];
  queryEmbedding: number[];
  limit?: number;
}) {
  return examples
    .filter(
      (example) =>
        example.brandId === brandId &&
        example.approved &&
        example.embedding &&
        example.embedding.length === queryEmbedding.length,
    )
    .map((example) => ({
      example,
      similarity: cosineSimilarity(queryEmbedding, example.embedding ?? []),
    }))
    .sort(
      (left, right) =>
        right.similarity - left.similarity || left.example.id.localeCompare(right.example.id),
    )
    .slice(0, Math.min(3, Math.max(1, limit)));
}
