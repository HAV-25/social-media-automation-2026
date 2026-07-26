import { z } from "zod";

export const organizationRoleSchema = z.enum(["administrator", "editor", "reviewer", "viewer"]);
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export const brandSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  name: z.string().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: z.enum(["active", "archived"]),
});
export type Brand = z.infer<typeof brandSchema>;

export const platformSchema = z.enum(["facebook"]);
export const contentStyleSchema = z.enum([
  "newsworthy_authority",
  "educational_breakdown",
  "perspective_conversation",
]);
export const toneSchema = z.enum([
  "authoritative",
  "conversational",
  "bold",
  "thoughtful",
  "witty",
]);

export const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_DEMO_MODE: z.stringbool().default(true),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  N8N_WEBHOOK_BASE_URL: z.url().default("http://localhost:5678"),
  AI_PROVIDER: z.enum(["fake", "openai"]).default("fake"),
});

export const operationsRunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type OperationsRunStatus = z.infer<typeof operationsRunStatusSchema>;

export const operationsErrorCategorySchema = z.enum([
  "transient",
  "permanent",
  "validation",
  "security",
  "budget",
  "provider",
  "unknown",
]);
export type OperationsErrorCategory = z.infer<typeof operationsErrorCategorySchema>;

export const operationsRunFilterSchema = z
  .object({
    view: z.enum(["all", "in_progress", "failed", "stalled"]).default("all"),
    runType: z
      .string()
      .trim()
      .regex(/^[a-z0-9_:-]{1,100}$/)
      .optional(),
    window: z.enum(["24h", "7d", "30d", "all"]).default("7d"),
    cursor: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type OperationsRunFilter = z.infer<typeof operationsRunFilterSchema>;

export const recoveryStatusSchema = z.enum([
  "registered",
  "scheduled",
  "dispatching",
  "retrying",
  "completed",
  "recovered",
  "dead_letter",
  "cancelled",
]);
export type RecoveryStatus = z.infer<typeof recoveryStatusSchema>;

export const serverEnvSchema = envSchema
  .extend({
    OPENAI_API_KEY: z.string().min(1).optional(),
    SUPABASE_SECRET_KEY: z.string().min(1).optional(),
    N8N_API_URL: z.url().optional(),
    N8N_API_KEY: z.string().min(1).optional(),
    WORKFLOW_HMAC_SECRET: z.string().min(32).optional(),
    WORKFLOW_HMAC_PREVIOUS_SECRET: z.string().min(32).optional(),
    WORKFLOW_SIGNATURE_TOLERANCE_SECONDS: z.coerce.number().int().min(30).max(900).default(300),
    USER_API_RATE_LIMIT_REQUESTS: z.coerce.number().int().min(1).max(1_000).default(60),
    USER_API_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86_400).default(60),
    INTERNAL_API_RATE_LIMIT_REQUESTS: z.coerce.number().int().min(1).max(10_000).default(600),
    INTERNAL_API_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86_400).default(60),
    RSS_ITEMS_PER_FEED_PER_RUN: z.coerce.number().int().min(1).max(20).default(3),
    AI_MODEL_EXTRACT: z.string().min(1).default("gpt-5.6-luna"),
    AI_MODEL_SCORE: z.string().min(1).default("gpt-5.6-terra"),
    AI_MODEL_RESEARCH: z.string().min(1).default("gpt-5.6-terra"),
    AI_MODEL_WRITE: z.string().min(1).default("gpt-5.6-terra"),
    AI_MODEL_VERIFY: z.string().min(1).default("gpt-5.6-terra"),
    AI_MODEL_IMAGE: z.string().min(1).default("gpt-image-2"),
    AI_RESEARCH_REASONING_EFFORT: z.enum(["none", "low", "medium", "high", "xhigh"]).default("low"),
    AI_WRITE_REASONING_EFFORT: z.enum(["none", "low", "medium", "high", "xhigh"]).default("low"),
    AI_DAILY_BUDGET_USD: z.coerce.number().positive().max(10_000).default(10),
    AI_PER_RUN_BUDGET_USD: z.coerce.number().positive().max(100).default(1),
    AI_INPUT_USD_PER_1M: z.coerce.number().nonnegative().max(1_000).default(0),
    AI_OUTPUT_USD_PER_1M: z.coerce.number().nonnegative().max(1_000).default(0),
    AI_WEB_SEARCH_USD_PER_CALL: z.coerce.number().nonnegative().max(100).default(0),
    AI_RESEARCH_MAX_QUERIES: z.coerce.number().int().min(1).max(8).default(3),
    AI_RESEARCH_MAX_DOMAINS: z.coerce.number().int().min(1).max(100).default(12),
    AI_RESEARCH_MAX_RESULTS: z.coerce.number().int().min(1).max(100).default(20),
    AI_RESEARCH_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(60_000),
    AI_RESEARCH_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(500).max(32_000).default(5_000),
    AI_WRITE_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(500).max(16_000).default(4_000),
    AI_WRITE_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(180_000).default(60_000),
    AI_WRITE_PER_RUN_BUDGET_USD: z.coerce.number().positive().max(100).default(0.5),
    AI_IMAGE_QUALITY: z.enum(["low", "medium", "high"]).default("low"),
    AI_IMAGE_SIZE: z
      .string()
      .regex(/^\d{2,4}x\d{2,4}$/)
      .default("1536x1024"),
    AI_IMAGE_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(300_000).default(120_000),
    AI_IMAGE_COST_USD_PER_IMAGE: z.coerce.number().nonnegative().max(100).default(0),
    AI_IMAGE_PER_RUN_BUDGET_USD: z.coerce.number().positive().max(100).default(0.25),
    AI_PROVIDER_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    AI_RESEARCH_EVAL_BASELINE_ID: z.string().trim().min(3).max(200).optional(),
    AI_EDITORIAL_EVAL_BASELINE_ID: z.string().trim().min(3).max(200).optional(),
    AI_IMAGE_EVAL_BASELINE_ID: z.string().trim().min(3).max(200).optional(),
  })
  .superRefine((environment, context) => {
    if (
      environment.WORKFLOW_HMAC_SECRET &&
      environment.WORKFLOW_HMAC_PREVIOUS_SECRET === environment.WORKFLOW_HMAC_SECRET
    ) {
      context.addIssue({
        code: "custom",
        path: ["WORKFLOW_HMAC_PREVIOUS_SECRET"],
        message: "The previous workflow secret must differ from the active secret.",
      });
    }
  });

export const rssIntakeContractSchema = z.object({
  contractVersion: z.literal("1.0"),
  correlationId: z.uuid(),
  idempotencyKey: z.string().min(16).max(200),
  feedId: z.uuid(),
  guid: z.string().min(1).max(2048),
  canonicalUrl: z.url().max(4096).optional(),
  title: z.string().min(1).max(1000),
  author: z.string().max(500).optional(),
  publishedAt: z.iso.datetime().optional(),
  summary: z.string().max(50_000).optional(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  requestedAt: z.iso.datetime(),
});
export type RssIntakeContract = z.infer<typeof rssIntakeContractSchema>;

export const rssIntakeResultSchema = z.object({
  rssItemId: z.uuid(),
  feedId: z.uuid(),
  sourceDocumentId: z.uuid(),
  generationRunId: z.uuid(),
  duplicate: z.boolean(),
  status: z.literal("received"),
});
export type RssIntakeResult = z.infer<typeof rssIntakeResultSchema>;

export const rssFeedPlanItemSchema = z.object({
  feedId: z.uuid(),
  feedUrl: z.url(),
  name: z.string().min(1),
  lastPolledAt: z.iso.datetime({ offset: true }).nullable(),
  brandLinks: z.array(
    z.object({
      brandId: z.uuid(),
      generationPolicy: z.enum(["ingest_only", "score_then_research"]),
      minimumScore: z.number().min(0).max(100),
      dailyGenerationLimit: z.number().int().min(0).max(100),
      includeKeywords: z.array(z.string().min(1).max(100)).max(50),
      excludeKeywords: z.array(z.string().min(1).max(100)).max(50),
    }),
  ),
});
export const rssFeedPlanSchema = z.object({
  contractVersion: z.literal("1.0"),
  feeds: z.array(rssFeedPlanItemSchema),
});

const rssBrandRouteInputSchema = z.object({
  brandId: z.uuid(),
  generationPolicy: z.enum(["ingest_only", "score_then_research"]),
  minimumScore: z.number().min(0).max(100),
  dailyGenerationLimit: z.number().int().min(0).max(100),
  topicTags: z.array(z.string().trim().min(1).max(80)).max(30),
  includeKeywords: z.array(z.string().trim().min(1).max(100)).max(50),
  excludeKeywords: z.array(z.string().trim().min(1).max(100)).max(50),
});

export const rssFeedUpsertRequestSchema = z.object({
  contractVersion: z.literal("1.0"),
  idempotencyKey: z.string().trim().min(16).max(200),
  feedId: z.uuid().optional(),
  name: z.string().trim().min(1).max(200),
  feedUrl: z.url().max(4_096),
  topicTags: z.array(z.string().trim().min(1).max(80)).max(30),
  authorityScore: z.number().min(0).max(100),
  active: z.boolean(),
  brandRoutes: z.array(rssBrandRouteInputSchema).min(1).max(50),
});

export const rssFeedMutationResultSchema = z.object({
  contractVersion: z.literal("1.0"),
  feedId: z.uuid(),
  duplicate: z.boolean(),
  active: z.boolean(),
});

export const rssManualRunRequestSchema = z.object({
  contractVersion: z.literal("1.0"),
  correlationId: z.uuid(),
  idempotencyKey: z.string().trim().min(16).max(200),
  actorId: z.uuid(),
  brandId: z.uuid(),
  requestedAt: z.iso.datetime(),
});

export const rssManualRunResultSchema = z.object({
  contractVersion: z.literal("1.0"),
  generationRunId: z.uuid(),
  duplicate: z.boolean(),
  status: z.enum(["accepted", "failed"]),
});
export type RssManualRunResult = z.infer<typeof rssManualRunResultSchema>;

export const rssGenerationReservationRequestSchema = z.object({
  contractVersion: z.literal("1.0"),
  correlationId: z.uuid(),
  idempotencyKey: z.string().trim().min(16).max(200),
  feedId: z.uuid(),
  brandId: z.uuid(),
  sourceDocumentId: z.uuid(),
  opportunityId: z.uuid(),
  opportunityScore: z.number().min(0).max(100),
  requestedAt: z.iso.datetime(),
});

export const rssGenerationReservationResultSchema = z.object({
  contractVersion: z.literal("1.0"),
  eligible: z.boolean(),
  reason: z.enum(["reserved", "ingest_only", "below_threshold", "daily_limit", "inactive"]),
  generationRunId: z.uuid().optional(),
  usedToday: z.number().int().nonnegative(),
  dailyLimit: z.number().int().nonnegative(),
  duplicate: z.boolean(),
});

export const rssSourceAnalysisRequestSchema = z.object({
  contractVersion: z.literal("1.0"),
  correlationId: z.uuid(),
  idempotencyKey: z.string().trim().min(16).max(120),
  feedId: z.uuid(),
  sourceDocumentId: z.uuid(),
  requestedAt: z.iso.datetime(),
});

export const rssSourceAnalysisResultSchema = z.object({
  contractVersion: z.literal("1.0"),
  sourceDocumentId: z.uuid(),
  results: z.array(
    z.object({
      actorId: z.uuid(),
      brandId: z.uuid(),
      opportunityId: z.uuid(),
      score: z.number().min(0).max(100),
      riskPenalty: z.number().min(0).max(30),
      duplicate: z.boolean(),
      researchEligible: z.boolean(),
      eligibilityReason: z.enum([
        "reserved",
        "ingest_only",
        "below_threshold",
        "daily_limit",
        "inactive",
      ]),
    }),
  ),
});

export const rssFetchRequestSchema = z.object({
  contractVersion: z.literal("1.0"),
  correlationId: z.uuid(),
  feedId: z.uuid(),
  idempotencyKey: z.string().min(16).max(200),
  requestedAt: z.iso.datetime(),
});

export const rssFetchResultSchema = z.object({
  contractVersion: z.literal("1.0"),
  feedId: z.uuid(),
  fetchedAt: z.iso.datetime(),
  finalUrl: z.url(),
  items: z.array(
    z.object({
      author: z.string().optional(),
      canonicalUrl: z.url().optional(),
      contentHash: z.string().regex(/^[0-9a-f]{64}$/),
      guid: z.string().min(1),
      publishedAt: z.iso.datetime().optional(),
      summary: z.string().optional(),
      title: z.string().min(1),
    }),
  ),
});

export const pipelineStateSchema = z.enum([
  "received",
  "extracting",
  "normalized",
  "clustered",
  "analyzed",
  "completed",
  "extraction_failed",
  "unsupported",
  "duplicate",
  "rejected",
]);

export const sourceTypeSchema = z.enum([
  "rss",
  "url",
  "pdf",
  "transcript",
  "social_content",
  "plain_text",
]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

const sourceProvenanceSchema = z.object({
  submittedBy: z.uuid(),
  receivedAt: z.iso.datetime(),
  originalFilename: z.string().trim().min(1).max(500).optional(),
  originalUrl: z.url().max(4_096).optional(),
  finalUrl: z.url().max(4_096).optional(),
  publisher: z.string().trim().max(500).optional(),
  author: z.string().trim().max(500).optional(),
  publishedAt: z.iso.datetime().optional(),
  rightsNotes: z.string().trim().max(2_000).optional(),
});

export const sourceAdapterRawResultSchema = z.object({
  contractVersion: z.literal("1.0"),
  outcome: z.literal("raw"),
  sourceType: sourceTypeSchema,
  mediaType: z.string().trim().min(1).max(200),
  byteLength: z.number().int().nonnegative().max(25_000_000),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  storagePath: z.string().trim().min(1).max(2_000).optional(),
  provenance: sourceProvenanceSchema,
});

export const sourceSectionSchema = z.object({
  index: z.number().int().nonnegative(),
  label: z.string().trim().min(1).max(500),
  text: z.string().min(1).max(500_000),
  pageStart: z.number().int().positive().optional(),
  pageEnd: z.number().int().positive().optional(),
  startMs: z.number().int().nonnegative().optional(),
  endMs: z.number().int().nonnegative().optional(),
});

export const sourceAdapterNormalizedResultSchema = z.object({
  contractVersion: z.literal("1.0"),
  outcome: z.literal("normalized"),
  sourceType: sourceTypeSchema,
  title: z.string().trim().min(1).max(1_000),
  cleanText: z.string().min(1).max(2_000_000),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  language: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
  canonicalUrl: z.url().max(4_096).optional(),
  sections: z.array(sourceSectionSchema).max(10_000),
  requiresManualReview: z.boolean(),
  reviewReasons: z.array(z.string().min(1).max(500)).max(20),
  provenance: sourceProvenanceSchema,
});

export const sourceAdapterFailureResultSchema = z.object({
  contractVersion: z.literal("1.0"),
  outcome: z.literal("failure"),
  sourceType: sourceTypeSchema,
  code: z.enum([
    "invalid_input",
    "unsupported_type",
    "unsafe_source",
    "too_large",
    "fetch_failed",
    "extraction_failed",
    "empty_content",
    "manual_review",
  ]),
  message: z.string().min(1).max(1_000),
  retryable: z.boolean(),
  sourceDocumentId: z.uuid().optional(),
  generationRunId: z.uuid().optional(),
  storagePath: z.string().trim().min(1).max(2_000).optional(),
  provenance: sourceProvenanceSchema,
});

export const sourceAdapterResultSchema = z.discriminatedUnion("outcome", [
  sourceAdapterRawResultSchema,
  sourceAdapterNormalizedResultSchema,
  sourceAdapterFailureResultSchema,
]);
export type SourceAdapterResult = z.infer<typeof sourceAdapterResultSchema>;

const oneOffInputBaseSchema = z.object({
  contractVersion: z.literal("1.0"),
  idempotencyKey: z.string().trim().min(16).max(200),
  brandId: z.uuid(),
  language: z
    .string()
    .trim()
    .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/)
    .default("en"),
  rightsNotes: z.string().trim().max(2_000).optional(),
});

export const oneOffJsonInputSchema = z.discriminatedUnion("sourceType", [
  oneOffInputBaseSchema.extend({
    sourceType: z.literal("url"),
    url: z.url().max(4_096),
  }),
  oneOffInputBaseSchema.extend({
    sourceType: z.literal("transcript"),
    title: z.string().trim().min(1).max(1_000),
    text: z.string().min(20).max(1_000_000),
  }),
  oneOffInputBaseSchema.extend({
    sourceType: z.literal("social_content"),
    title: z.string().trim().min(1).max(1_000),
    text: z.string().min(20).max(500_000),
    sourceUrl: z.url().max(4_096).optional(),
    engagement: z
      .object({
        reactions: z.number().int().nonnegative().max(1_000_000_000).optional(),
        comments: z.number().int().nonnegative().max(1_000_000_000).optional(),
        shares: z.number().int().nonnegative().max(1_000_000_000).optional(),
      })
      .optional(),
  }),
]);
export type OneOffJsonInput = z.infer<typeof oneOffJsonInputSchema>;

export const manualInputRequestSchema = z.object({
  contractVersion: z.literal("1.0"),
  idempotencyKey: z.string().trim().min(16).max(200),
  brandId: z.uuid(),
  sourceType: z.literal("plain_text"),
  title: z.string().trim().min(1).max(1_000),
  text: z.string().min(20).max(500_000),
  language: z
    .string()
    .trim()
    .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/)
    .default("en"),
  rightsNotes: z.string().trim().max(2_000).optional(),
});
export type ManualInputRequest = z.infer<typeof manualInputRequestSchema>;

export const scoreDimensionSchema = z.object({
  score: z.number().min(0),
  maximum: z.number().positive(),
  reason: z.string().min(1),
});

export const opportunityScoreBreakdownSchema = z.object({
  contractVersion: z.literal("1.0"),
  dimensions: z.object({
    newsOrLearningValue: scoreDimensionSchema,
    audienceRelevance: scoreDimensionSchema,
    consequenceOrUsefulness: scoreDimensionSchema,
    novelty: scoreDimensionSchema,
    evidenceStrength: scoreDimensionSchema,
    shareability: scoreDimensionSchema,
    conversationPotential: scoreDimensionSchema,
    brandAuthorityFit: scoreDimensionSchema,
    timeliness: scoreDimensionSchema,
  }),
  grossScore: z.number().min(0).max(100),
  riskPenalty: z.number().min(0).max(30),
  finalScore: z.number().min(0).max(100),
  riskReasons: z.array(z.string()),
});
export type OpportunityScoreBreakdown = z.infer<typeof opportunityScoreBreakdownSchema>;

export const sourceAnalysisSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    summary: z.string().trim().min(20).max(2_000),
    sourceKind: z.enum([
      "reporting",
      "primary_document",
      "research",
      "opinion",
      "promotional",
      "internal_observation",
      "transcript",
    ]),
    namedEntities: z.array(z.string().trim().min(1).max(200)).max(20),
    topicTags: z.array(z.string().trim().min(1).max(100)).max(12),
    candidateClaims: z
      .array(
        z
          .object({
            text: z.string().trim().min(3).max(2_000),
            claimType: z.enum(["factual", "numerical", "opinion", "interpretation"]),
            riskLevel: z.enum(["low", "medium", "high"]),
            sourceSupport: z.enum(["stated", "demonstrated", "unclear"]),
          })
          .strict(),
      )
      .max(30),
    riskSignals: z.array(z.string().trim().min(3).max(500)).max(20),
    instructionLikeTextDetected: z.boolean(),
  })
  .strict();

export const opportunityAnalysisSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    valueNucleus: z.string().trim().min(20).max(2_000),
    audienceConsequence: z.string().trim().min(10).max(2_000),
    recommendedStyle: contentStyleSchema,
    styleRationale: z.string().trim().min(10).max(1_000),
    researchNeed: z.enum(["none", "helpful", "required"]),
    researchReason: z.string().trim().min(3).max(1_000),
    riskFlags: z.array(z.string().trim().min(3).max(500)).max(20),
  })
  .strict();

export const researchBudgetSchema = z
  .object({
    maxQueries: z.number().int().min(1).max(8),
    maxDomains: z.number().int().min(1).max(100),
    maxResults: z.number().int().min(1).max(100),
    maxElapsedMs: z.number().int().min(5_000).max(300_000),
    maxOutputTokens: z.number().int().min(500).max(32_000),
    maxCostUsd: z.number().positive().max(100),
  })
  .strict();

export const researchDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    "Use a hostname without a protocol or path.",
  );

export const researchPlanSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    opportunityId: z.uuid(),
    objective: z.string().trim().min(20).max(2_000),
    queries: z
      .array(
        z
          .object({
            query: z.string().trim().min(3).max(300),
            purpose: z.string().trim().min(3).max(500),
            priority: z.enum(["required", "helpful"]),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    preferredSourceTypes: z
      .array(
        z.enum([
          "primary_document",
          "official_announcement",
          "original_research",
          "regulator",
          "credible_reporting",
          "expert_analysis",
        ]),
      )
      .min(1)
      .max(6),
    allowedDomains: z.array(researchDomainSchema).max(100),
    excludedContext: z.array(z.string().trim().min(3).max(500)).max(12),
    budget: researchBudgetSchema,
  })
  .strict()
  .superRefine((plan, context) => {
    if (plan.queries.length > plan.budget.maxQueries) {
      context.addIssue({
        code: "custom",
        path: ["queries"],
        message: "Research queries exceed the plan budget.",
      });
    }
    if (plan.allowedDomains.length > plan.budget.maxDomains) {
      context.addIssue({
        code: "custom",
        path: ["allowedDomains"],
        message: "Allowed domains exceed the plan budget.",
      });
    }
  });

export const researchSourceSchema = z
  .object({
    sourceKey: z.string().regex(/^source_[a-z0-9]{6,40}$/),
    url: z
      .url()
      .max(4_096)
      .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
        message: "Research source URLs must use HTTP or HTTPS.",
      }),
    title: z.string().trim().min(1).max(1_000),
    publisher: z.string().trim().min(1).max(500),
    publishedAt: z.iso.datetime().nullable(),
    retrievedAt: z.iso.datetime(),
    sourceType: z.enum([
      "primary_document",
      "official_announcement",
      "original_research",
      "regulator",
      "credible_reporting",
      "expert_analysis",
      "source_material",
    ]),
    authorityScore: z.number().min(0).max(100),
    relevantExcerpt: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const claimEvidenceSchema = z
  .object({
    sourceKey: z.string().regex(/^source_[a-z0-9]{6,40}$/),
    supportType: z.enum(["supports", "contradicts", "context"]),
    excerpt: z.string().trim().min(1).max(1_000),
    locator: z.string().trim().min(1).max(500).nullable(),
  })
  .strict();

export const evidenceClaimSchema = z
  .object({
    claimKey: z.string().regex(/^claim_[a-z0-9]{6,40}$/),
    text: z.string().trim().min(3).max(2_000),
    claimType: z.enum(["factual", "numerical", "opinion", "interpretation"]),
    importance: z.enum(["core", "supporting", "optional"]),
    riskLevel: z.enum(["low", "medium", "high"]),
    verificationState: z.enum([
      "verified",
      "partially_supported",
      "disputed",
      "unsupported",
      "opinion",
    ]),
    confidence: z.number().min(0).max(1),
    evidence: z.array(claimEvidenceSchema).max(20),
    usageGuidance: z.enum(["safe", "caveat", "do_not_use"]),
    caveat: z.string().trim().min(1).max(1_000).nullable(),
  })
  .strict();

export const claimConflictSchema = z
  .object({
    conflictKey: z.string().regex(/^conflict_[a-z0-9]{6,40}$/),
    claimKeys: z
      .array(z.string().regex(/^claim_[a-z0-9]{6,40}$/))
      .min(1)
      .max(10),
    description: z.string().trim().min(3).max(2_000),
    resolution: z.string().trim().min(3).max(2_000),
    material: z.boolean(),
  })
  .strict();

export const evidencePackageSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    opportunityId: z.uuid(),
    summary: z.string().trim().min(20).max(5_000),
    sources: z.array(researchSourceSchema).max(100),
    claims: z.array(evidenceClaimSchema).max(100),
    conflicts: z.array(claimConflictSchema).max(30),
    caveats: z.array(z.string().trim().min(3).max(1_000)).max(30),
    readyForWriting: z.boolean(),
  })
  .strict();
export type EvidencePackage = z.infer<typeof evidencePackageSchema>;

export const researchProviderResultSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    evidencePackage: evidencePackageSchema,
    model: z.string().min(1).max(200),
    promptVersion: z.string().min(1).max(100),
    responseId: z.string().min(1).max(500),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        webSearchCalls: z.number().int().nonnegative(),
        estimatedCostUsd: z.number().nonnegative(),
      })
      .strict(),
    elapsedMs: z.number().int().nonnegative(),
  })
  .strict();
export type ResearchProviderResult = z.infer<typeof researchProviderResultSchema>;

export const researchStartRequestSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    idempotencyKey: z.string().trim().min(16).max(200),
    allowedDomains: z.array(researchDomainSchema).max(12).default([]),
  })
  .strict();
export type ResearchStartRequest = z.infer<typeof researchStartRequestSchema>;

export const researchWorkflowRequestSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    correlationId: z.uuid(),
    idempotencyKey: z.string().trim().min(16).max(200),
    actorId: z.uuid(),
    brandId: z.uuid(),
    opportunityId: z.uuid(),
    allowedDomains: z.array(researchDomainSchema).max(12).default([]),
    requestedAt: z.iso.datetime(),
  })
  .strict();
export type ResearchWorkflowRequest = z.infer<typeof researchWorkflowRequestSchema>;

export const researchRunResultSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    researchRunId: z.uuid(),
    generationRunId: z.uuid(),
    status: z.enum(["evidence_ready", "review_required"]),
    duplicate: z.boolean(),
    readyForWriting: z.boolean(),
    sourceCount: z.number().int().nonnegative().max(100),
    claimCount: z.number().int().nonnegative().max(100),
  })
  .strict();
export type ResearchRunResult = z.infer<typeof researchRunResultSchema>;

export const researchBudgetReservationResultSchema = z
  .object({
    generationRunId: z.uuid(),
    duplicate: z.boolean(),
    reservedCostUsd: z.number().nonnegative(),
    spentTodayUsd: z.number().nonnegative(),
    dailyBudgetUsd: z.number().positive(),
  })
  .strict();
export type ResearchBudgetReservationResult = z.infer<typeof researchBudgetReservationResultSchema>;

export function validateEvidencePackageIntegrity(value: EvidencePackage) {
  const sourceKeys = new Set(value.sources.map((source) => source.sourceKey));
  const claimKeys = new Set(value.claims.map((claim) => claim.claimKey));
  const issues: string[] = [];
  if (sourceKeys.size !== value.sources.length) issues.push("Duplicate research source keys.");
  if (claimKeys.size !== value.claims.length) issues.push("Duplicate claim keys.");
  if (value.readyForWriting && value.claims.length === 0) {
    issues.push("A writing-ready evidence package must contain at least one claim.");
  }
  for (const claim of value.claims) {
    for (const evidence of claim.evidence) {
      if (!sourceKeys.has(evidence.sourceKey)) {
        issues.push(`Claim ${claim.claimKey} references an unknown source.`);
      }
    }
    const supportingEvidence = claim.evidence.some(
      (evidence) => evidence.supportType === "supports",
    );
    if (
      ["factual", "numerical"].includes(claim.claimType) &&
      claim.verificationState === "verified" &&
      !supportingEvidence
    ) {
      issues.push(`Verified claim ${claim.claimKey} has no supporting source.`);
    }
    if (
      claim.riskLevel === "high" &&
      claim.verificationState !== "verified" &&
      claim.usageGuidance !== "do_not_use"
    ) {
      issues.push(`Unverified high-risk claim ${claim.claimKey} is not blocked.`);
    }
  }
  for (const conflict of value.conflicts) {
    if (conflict.claimKeys.some((claimKey) => !claimKeys.has(claimKey))) {
      issues.push(`Conflict ${conflict.conflictKey} references an unknown claim.`);
    }
  }
  if (
    value.readyForWriting &&
    value.claims.some(
      (claim) =>
        claim.importance === "core" &&
        ["unsupported", "disputed"].includes(claim.verificationState),
    )
  ) {
    issues.push("Evidence package is ready despite an unusable core claim.");
  }
  return { ok: issues.length === 0, issues };
}

export const manualInputResultSchema = z.object({
  contractVersion: z.literal("1.0"),
  sourceDocumentId: z.uuid(),
  opportunityId: z.uuid(),
  generationRunId: z.uuid(),
  duplicate: z.boolean(),
  score: z.number().min(0).max(100),
  riskPenalty: z.number().min(0).max(30),
  status: z.literal("analyzed"),
});
export type ManualInputResult = z.infer<typeof manualInputResultSchema>;

export const postContentSchema = z.object({
  hook: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(8_000),
  closing: z.string().trim().max(1_000),
  fullText: z.string().trim().min(1).max(10_000),
});

export const angleCandidateSchema = z
  .object({
    angleKey: z.string().regex(/^angle_[a-z0-9]{6,40}$/),
    title: z.string().trim().min(3).max(200),
    thesis: z.string().trim().min(20).max(1_500),
    contentStyle: contentStyleSchema,
    intendedReaction: z.string().trim().min(3).max(500),
    supportingClaimKeys: z.array(z.string().regex(/^claim_[a-z0-9]{6,40}$/)).max(20),
    score: z.number().min(0).max(100),
    rankExplanation: z.string().trim().min(10).max(1_000),
  })
  .strict();
export type AngleCandidate = z.infer<typeof angleCandidateSchema>;

export const sentenceClaimMappingSchema = z
  .object({
    sentence: z.string().trim().min(1).max(2_000),
    claimKeys: z.array(z.string().regex(/^claim_[a-z0-9]{6,40}$/)).max(20),
    state: z.enum(["supported", "interpretation", "unsupported"]),
  })
  .strict();
export type SentenceClaimMapping = z.infer<typeof sentenceClaimMappingSchema>;

export const draftEvaluationSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    evidenceScore: z.number().min(0).max(100),
    brandFitScore: z.number().min(0).max(100),
    qualityScore: z.number().min(0).max(100),
    sourceSimilarity: z.number().min(0).max(1),
    sameBrandSimilarity: z.number().min(0).max(1),
    crossBrandSimilarity: z.number().min(0).max(1),
    hookReuseSimilarity: z.number().min(0).max(1),
    unsupportedHighRiskClaims: z.number().int().nonnegative(),
    contradictions: z.number().int().nonnegative(),
    prohibitedPhrases: z.array(z.string().trim().min(1).max(200)).max(50),
    restrictedTopics: z.array(z.string().trim().min(1).max(200)).max(50),
    cliches: z.array(z.string().trim().min(1).max(200)).max(50),
    warnings: z.array(z.string().trim().min(1).max(500)).max(50),
    sentenceClaims: z.array(sentenceClaimMappingSchema).max(100),
    readyForReview: z.boolean(),
  })
  .strict();
export type DraftEvaluation = z.infer<typeof draftEvaluationSchema>;

export const editorialGenerationSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    contentStyle: contentStyleSchema,
    tone: toneSchema,
    angles: z.array(angleCandidateSchema).length(3),
    selectedAngleKey: z.string().regex(/^angle_[a-z0-9]{6,40}$/),
    content: postContentSchema,
    revisionCount: z.number().int().min(0).max(2),
  })
  .strict();
export type EditorialGeneration = z.infer<typeof editorialGenerationSchema>;

export const fakeDraftOutputSchema = editorialGenerationSchema.extend({
  evaluation: draftEvaluationSchema,
  model: z.string().min(1).max(200),
  promptVersion: z.string().min(1),
  responseId: z.string().min(1),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().nonnegative().default(0),
  }),
});
export type FakeDraftOutput = z.infer<typeof fakeDraftOutputSchema>;

export const draftGenerationRequestSchema = z.object({
  contractVersion: z.literal("1.0"),
  idempotencyKey: z.string().trim().min(16).max(200),
  contentStyle: contentStyleSchema,
  tone: toneSchema,
});
export type DraftGenerationRequest = z.infer<typeof draftGenerationRequestSchema>;

export const draftGenerationResultSchema = z.object({
  contractVersion: z.literal("1.0"),
  postDraftId: z.uuid(),
  postVersionId: z.uuid(),
  generationRunId: z.uuid(),
  status: z.literal("ready_for_review"),
  duplicate: z.boolean(),
});
export type DraftGenerationResult = z.infer<typeof draftGenerationResultSchema>;

const editorialWorkflowEnvelopeSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    correlationId: z.uuid(),
    idempotencyKey: z.string().trim().min(16).max(200),
    actorId: z.uuid(),
    brandId: z.uuid(),
    requestedAt: z.iso.datetime(),
  })
  .strict();

export const editorialWorkflowRequestSchema = editorialWorkflowEnvelopeSchema
  .extend({
    opportunityId: z.uuid(),
    contentStyles: z.array(contentStyleSchema).min(1).max(3),
    tone: toneSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.contentStyles).size !== value.contentStyles.length) {
      context.addIssue({
        code: "custom",
        path: ["contentStyles"],
        message: "Editorial workflow styles must be unique.",
      });
    }
  });
export type EditorialWorkflowRequest = z.infer<typeof editorialWorkflowRequestSchema>;

export const editorialWorkflowResultSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    opportunityId: z.uuid(),
    drafts: z.array(draftGenerationResultSchema).min(1).max(3),
  })
  .strict();
export type EditorialWorkflowResult = z.infer<typeof editorialWorkflowResultSchema>;

export const postVerificationWorkflowRequestSchema = editorialWorkflowEnvelopeSchema
  .extend({
    postDraftId: z.uuid(),
  })
  .strict();
export type PostVerificationWorkflowRequest = z.infer<typeof postVerificationWorkflowRequestSchema>;

export const postVerificationWorkflowResultSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    postDraftId: z.uuid(),
    postVersionId: z.uuid(),
    evaluation: draftEvaluationSchema,
    duplicate: z.boolean(),
  })
  .strict();
export type PostVerificationWorkflowResult = z.infer<typeof postVerificationWorkflowResultSchema>;

export const imageStyleSchema = z.enum([
  "editorial_hero",
  "insight_card",
  "conceptual_illustration",
  "branded_headline_card",
]);
export type ImageStyle = z.infer<typeof imageStyleSchema>;

export const imageTemplateSchema = z.enum([
  "editorial_overlay",
  "insight_split",
  "concept_frame",
  "headline_panel",
]);
export type ImageTemplate = z.infer<typeof imageTemplateSchema>;

export const imageConceptSchema = z
  .object({
    conceptKey: z.string().regex(/^concept_[a-z0-9]{6,40}$/),
    title: z.string().trim().min(3).max(160),
    visualNucleus: z.string().trim().min(20).max(1_500),
    imageStyle: imageStyleSchema,
    literalOrConceptual: z.enum(["literal", "conceptual"]),
    composition: z.string().trim().min(20).max(1_500),
    palette: z
      .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
      .min(2)
      .max(6),
    avoid: z.array(z.string().trim().min(2).max(200)).max(20),
    headlineOverlay: z.string().trim().min(1).max(100),
    sourceLabel: z.string().trim().max(120),
    rank: z.number().int().min(1).max(3),
    score: z.number().min(0).max(100),
    rankExplanation: z.string().trim().min(10).max(1_000),
  })
  .strict();
export type ImageConcept = z.infer<typeof imageConceptSchema>;

export const imageDirectionSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    concepts: z.array(imageConceptSchema).length(3),
    selectedConceptKey: z.string().regex(/^concept_[a-z0-9]{6,40}$/),
  })
  .strict()
  .superRefine((value, context) => {
    const conceptKeys = value.concepts.map((concept) => concept.conceptKey);
    const ranks = value.concepts.map((concept) => concept.rank);
    if (new Set(conceptKeys).size !== conceptKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["concepts"],
        message: "Concept keys must be unique.",
      });
    }
    if (
      new Set(ranks).size !== 3 ||
      !ranks.includes(1) ||
      !ranks.includes(2) ||
      !ranks.includes(3)
    ) {
      context.addIssue({
        code: "custom",
        path: ["concepts"],
        message: "Concept ranks must be 1, 2, and 3.",
      });
    }
    if (!conceptKeys.includes(value.selectedConceptKey)) {
      context.addIssue({
        code: "custom",
        path: ["selectedConceptKey"],
        message: "The selected concept must exist in the concept set.",
      });
    }
  });
export type ImageDirection = z.infer<typeof imageDirectionSchema>;

export const generatedImageSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    imageBase64: z.string().min(20),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    width: z.number().int().min(256).max(3_840),
    height: z.number().int().min(256).max(3_840),
    model: z.string().trim().min(1).max(200),
    providerResponseId: z.string().trim().min(1).max(500),
    promptVersion: z.string().trim().min(1).max(100),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        estimatedCostUsd: z.number().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type GeneratedImage = z.infer<typeof generatedImageSchema>;

export const imageValidationSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    byteLength: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024),
    aspectRatio: z.number().positive(),
    hasSufficientOverlayContrast: z.boolean(),
    focalSafeAreaClear: z.boolean(),
    generatedTextDetected: z.boolean(),
    unsafeImageryDetected: z.boolean(),
    misleadingRepresentationRisk: z.enum(["low", "medium", "high"]),
    warnings: z.array(z.string().trim().min(3).max(500)).max(30),
    readyForComposition: z.boolean(),
    humanOverrideRequired: z.boolean(),
  })
  .strict();
export type ImageValidation = z.infer<typeof imageValidationSchema>;

export const imageAssetStatusSchema = z.enum([
  "generating",
  "validation_required",
  "ready",
  "failed",
]);
export type ImageAssetStatus = z.infer<typeof imageAssetStatusSchema>;

export const imageGenerationRequestSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    idempotencyKey: z.string().trim().min(16).max(200),
    imageStyle: imageStyleSchema,
    template: imageTemplateSchema,
    conceptKey: z
      .string()
      .regex(/^concept_[a-z0-9]{6,40}$/)
      .optional(),
  })
  .strict();
export type ImageGenerationRequest = z.infer<typeof imageGenerationRequestSchema>;

export const imageGenerationResultSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    imageAssetId: z.uuid(),
    postDraftId: z.uuid(),
    baseImagePath: z.string().trim().min(1).max(1_024),
    finalImagePath: z.string().trim().min(1).max(1_024).nullable(),
    status: z.enum(["validation_required", "ready"]),
    duplicate: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "ready" && !value.finalImagePath) {
      context.addIssue({
        code: "custom",
        path: ["finalImagePath"],
        message: "A ready workflow image requires a final image path.",
      });
    }
    if (value.status === "validation_required" && value.finalImagePath) {
      context.addIssue({
        code: "custom",
        path: ["finalImagePath"],
        message: "An image awaiting validation cannot expose a final image path.",
      });
    }
  });
export type ImageGenerationResult = z.infer<typeof imageGenerationResultSchema>;

export const imageReviewActionSchema = z.enum([
  "generate",
  "regenerate_concept",
  "select_concept",
  "regenerate_base",
  "change_template",
]);
export type ImageReviewAction = z.infer<typeof imageReviewActionSchema>;

export const imageReviewActionRequestSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    idempotencyKey: z.string().trim().min(16).max(200),
    expectedVersionId: z.uuid(),
    action: imageReviewActionSchema,
    conceptKey: z
      .string()
      .regex(/^concept_[a-z0-9]{6,40}$/)
      .optional(),
    template: imageTemplateSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === "select_concept" && !value.conceptKey) {
      context.addIssue({
        code: "custom",
        path: ["conceptKey"],
        message: "Selecting a concept requires its concept key.",
      });
    }
    if (value.action === "change_template" && !value.template) {
      context.addIssue({
        code: "custom",
        path: ["template"],
        message: "Changing a template requires the template.",
      });
    }
  });
export type ImageReviewActionRequest = z.infer<typeof imageReviewActionRequestSchema>;

export const imageReviewActionResultSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    postDraftId: z.uuid(),
    postVersionId: z.uuid(),
    imageAssetId: z.uuid(),
    selectedConceptKey: z.string().regex(/^concept_[a-z0-9]{6,40}$/),
    template: imageTemplateSchema,
    status: z.literal("ready"),
    duplicate: z.boolean(),
  })
  .strict();
export type ImageReviewActionResult = z.infer<typeof imageReviewActionResultSchema>;

export const imageAssetPersistenceResultSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    imageAssetId: z.uuid(),
    generationRunId: z.uuid(),
    status: z.enum(["validation_required", "ready"]),
    baseImagePath: z.string().trim().min(1).max(1_024),
    finalImagePath: z.string().trim().min(1).max(1_024).nullable(),
    duplicate: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "ready" && !value.finalImagePath) {
      context.addIssue({
        code: "custom",
        path: ["finalImagePath"],
        message: "A ready image asset requires a final image path.",
      });
    }
    if (value.status === "validation_required" && value.finalImagePath) {
      context.addIssue({
        code: "custom",
        path: ["finalImagePath"],
        message: "An image awaiting override cannot expose a final image path.",
      });
    }
  });
export type ImageAssetPersistenceResult = z.infer<typeof imageAssetPersistenceResultSchema>;

export const imageValidationOverrideRequestSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    idempotencyKey: z.string().trim().min(16).max(200),
    reason: z.string().trim().min(10).max(2_000),
  })
  .strict();
export type ImageValidationOverrideRequest = z.infer<typeof imageValidationOverrideRequestSchema>;

export const imageValidationOverrideResultSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    imageAssetId: z.uuid(),
    generationRunId: z.uuid(),
    status: z.literal("ready"),
    finalImagePath: z.string().trim().min(1).max(1_024),
    duplicate: z.boolean(),
  })
  .strict();
export type ImageValidationOverrideResult = z.infer<typeof imageValidationOverrideResultSchema>;

export const imageWorkflowRequestSchema = editorialWorkflowEnvelopeSchema
  .extend({
    postDraftId: z.uuid(),
    expectedVersionId: z.uuid(),
    action: z
      .enum(["generate", "regenerate_concept", "regenerate_base", "change_template"])
      .default("generate"),
    imageStyle: imageStyleSchema,
    template: imageTemplateSchema,
    conceptKey: z
      .string()
      .regex(/^concept_[a-z0-9]{6,40}$/)
      .optional(),
  })
  .strict();
export type ImageWorkflowRequest = z.infer<typeof imageWorkflowRequestSchema>;

export const postRegenerationRequestSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    idempotencyKey: z.string().trim().min(16).max(200),
    expectedVersionId: z.uuid(),
    component: z.enum(["hook", "body", "closing"]),
    instruction: z.string().trim().min(3).max(500),
  })
  .strict();
export type PostRegenerationRequest = z.infer<typeof postRegenerationRequestSchema>;

export const postActionWorkflowRequestSchema = editorialWorkflowEnvelopeSchema
  .extend({
    postDraftId: z.uuid(),
    expectedVersionId: z.uuid(),
    component: z.enum(["hook", "body", "closing"]),
    instruction: z.string().trim().min(3).max(500),
  })
  .strict();
export type PostActionWorkflowRequest = z.infer<typeof postActionWorkflowRequestSchema>;

export const recoveryTargetSchema = z.enum([
  "research",
  "editorial_generation",
  "post_verification",
  "image_generation",
  "content_action",
]);
export type RecoveryTarget = z.infer<typeof recoveryTargetSchema>;

const recoveryPayloadByTarget = {
  research: researchWorkflowRequestSchema,
  editorial_generation: editorialWorkflowRequestSchema,
  post_verification: postVerificationWorkflowRequestSchema,
  image_generation: imageWorkflowRequestSchema,
  content_action: postActionWorkflowRequestSchema,
} as const;

export const workflowRecoveryExecutionSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    workflowExecutionId: z.string().trim().min(1).max(200),
    workflowName: z
      .string()
      .trim()
      .regex(/^WF-0[5-9] [A-Za-z0-9 &-]{3,120}$/),
    target: recoveryTargetSchema,
    requestPayload: z.unknown(),
  })
  .strict()
  .superRefine((value, context) => {
    const parsed = recoveryPayloadByTarget[value.target].safeParse(value.requestPayload);
    if (!parsed.success) {
      context.addIssue({
        code: "custom",
        path: ["requestPayload"],
        message: `Recovery payload does not match ${value.target}.`,
      });
    }
  })
  .transform((value) => ({
    ...value,
    requestPayload: recoveryPayloadByTarget[value.target].parse(value.requestPayload),
  }));
export type WorkflowRecoveryExecution = z.infer<typeof workflowRecoveryExecutionSchema>;

export const workflowRecoveryFailureSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    workflowExecutionId: z.string().trim().min(1).max(200),
    retryOfExecutionId: z.string().trim().min(1).max(200).nullable().default(null),
    workflowName: z.string().trim().min(3).max(160),
    errorCode: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_.:-]{1,120}$/),
    category: operationsErrorCategorySchema,
    retryable: z.boolean(),
    occurredAt: z.iso.datetime(),
  })
  .strict();
export type WorkflowRecoveryFailure = z.infer<typeof workflowRecoveryFailureSchema>;

export const workflowRecoveryCompletionSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    workflowExecutionId: z.string().trim().min(1).max(200),
    completedAt: z.iso.datetime(),
  })
  .strict();
export type WorkflowRecoveryCompletion = z.infer<typeof workflowRecoveryCompletionSchema>;

export const workflowRecoveryDispatchSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    requestedAt: z.iso.datetime(),
    limit: z.number().int().min(1).max(10).default(5),
  })
  .strict();
export type WorkflowRecoveryDispatch = z.infer<typeof workflowRecoveryDispatchSchema>;

export const manualRunRecoveryRequestSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    idempotencyKey: z.string().trim().min(16).max(200),
    reason: z.string().trim().min(10).max(1_000),
  })
  .strict();
export type ManualRunRecoveryRequest = z.infer<typeof manualRunRecoveryRequestSchema>;

export const postRegenerationResultSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    postDraftId: z.uuid(),
    postVersionId: z.uuid(),
    versionNumber: z.number().int().positive(),
    status: z.literal("ready_for_review"),
    duplicate: z.boolean(),
  })
  .strict();
export type PostRegenerationResult = z.infer<typeof postRegenerationResultSchema>;

export const postReviewActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("edit"),
    idempotencyKey: z.string().min(16).max(200),
    expectedVersionId: z.uuid(),
    content: postContentSchema,
  }),
  z.object({
    action: z.literal("approve"),
    idempotencyKey: z.string().min(16).max(200),
    expectedVersionId: z.uuid(),
    reason: z.string().trim().max(2_000).default(""),
  }),
  z.object({
    action: z.literal("reject"),
    idempotencyKey: z.string().min(16).max(200),
    expectedVersionId: z.uuid(),
    reason: z.string().trim().min(3).max(2_000),
  }),
  z.object({
    action: z.literal("request_changes"),
    idempotencyKey: z.string().min(16).max(200),
    expectedVersionId: z.uuid(),
    reason: z.string().trim().min(3).max(2_000),
  }),
]);
export type PostReviewAction = z.infer<typeof postReviewActionSchema>;

export const postReviewResultSchema = z.object({
  contractVersion: z.literal("1.0"),
  postDraftId: z.uuid(),
  postVersionId: z.uuid(),
  status: z.enum(["ready_for_review", "changes_requested", "approved", "rejected"]),
  duplicate: z.boolean(),
});
export type PostReviewResult = z.infer<typeof postReviewResultSchema>;
