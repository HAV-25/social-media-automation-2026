import {
  evidencePackageSchema,
  researchSourceSchema,
  researchPlanSchema,
  researchProviderResultSchema,
  validateEvidencePackageIntegrity,
  type EvidencePackage,
  type ResearchProviderResult,
} from "@content-engine/contracts";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  EVIDENCE_SYNTHESIZER_PROMPT_VERSION,
  EVIDENCE_SYNTHESIZER_SYSTEM_PROMPT,
} from "./prompts/evidence-synthesizer.v1";

const optionalHttpUrlSchema = z
  .url()
  .max(4_096)
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "Original source URLs must use HTTP or HTTPS.",
  })
  .optional();

// OpenAI Structured Outputs does not accept JSON Schema's `uri` format. Keep
// the provider-facing field as a bounded string, then apply the full HTTP(S)
// URL contract when `evidencePackageSchema` parses the returned value.
const providerEvidencePackageSchema = evidencePackageSchema.extend({
  sources: z.array(
    researchSourceSchema.extend({
      url: z.string().trim().min(1).max(4_096),
    }),
  ),
});

export const researchRequestSchema = z
  .object({
    plan: researchPlanSchema,
    sourceTitle: z.string().trim().min(1).max(1_000),
    sourceText: z.string().trim().min(20).max(120_000),
    originalSourceUrl: optionalHttpUrlSchema,
  })
  .strict();
export type ResearchRequest = z.infer<typeof researchRequestSchema>;

export const researchProviderConfigSchema = z
  .object({
    apiKey: z.string().min(1),
    model: z.string().min(1).max(200),
    reasoningEffort: z.enum(["none", "low", "medium", "high", "xhigh"]).default("low"),
    inputUsdPer1M: z.number().positive().max(1_000),
    outputUsdPer1M: z.number().positive().max(1_000),
    webSearchUsdPerCall: z.number().positive().max(100),
    maxRetries: z.number().int().min(0).max(5).default(2),
  })
  .strict();
export type ResearchProviderConfig = z.input<typeof researchProviderConfigSchema>;
type ResolvedResearchProviderConfig = z.output<typeof researchProviderConfigSchema>;

export interface ResearchProvider {
  research(request: ResearchRequest): Promise<ResearchProviderResult>;
}

export type ResearchProviderTrace = Pick<
  ResearchProviderResult,
  "model" | "promptVersion" | "responseId" | "usage"
>;

export class ResearchProviderError extends Error {
  constructor(
    readonly code:
      | "budget_exceeded"
      | "invalid_evidence"
      | "provider_refusal"
      | "provider_truncated"
      | "provider_timeout"
      | "provider_rate_limited"
      | "provider_error",
    message: string,
    readonly retryable: boolean,
    public trace?: ResearchProviderTrace,
  ) {
    super(message);
    this.name = "ResearchProviderError";
  }
}

function approximateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

export function estimateResearchCost(
  usage: { inputTokens: number; outputTokens: number; webSearchCalls: number },
  pricing: Pick<ResearchProviderConfig, "inputUsdPer1M" | "outputUsdPer1M" | "webSearchUsdPerCall">,
) {
  return Number(
    (
      (usage.inputTokens / 1_000_000) * pricing.inputUsdPer1M +
      (usage.outputTokens / 1_000_000) * pricing.outputUsdPer1M +
      usage.webSearchCalls * pricing.webSearchUsdPerCall
    ).toFixed(6),
  );
}

export function buildLeanResearchPlan(input: {
  opportunityId: string;
  sourceTitle: string;
  valueNucleus: string;
  namedEntities?: string[];
  allowedDomains?: string[];
  budget: z.input<typeof researchPlanSchema>["budget"];
}) {
  const entities = (input.namedEntities ?? []).slice(0, 2).join(" ");
  const candidates = [
    {
      query: `"${input.sourceTitle}"`,
      purpose: "Locate the originating document or announcement.",
      priority: "required" as const,
    },
    {
      query: `${input.sourceTitle} official source ${entities}`.trim(),
      purpose: "Verify the core claim with a primary or official source.",
      priority: "required" as const,
    },
    {
      query: `${input.sourceTitle} evidence criticism limitations`.trim(),
      purpose: "Find a material contradiction, limitation, or independent check.",
      priority: "helpful" as const,
    },
  ];

  return researchPlanSchema.parse({
    contractVersion: "1.0",
    opportunityId: input.opportunityId,
    objective: `Verify this opportunity's core claim and material caveats: ${input.valueNucleus}`,
    queries: candidates.slice(0, input.budget.maxQueries),
    preferredSourceTypes: [
      "primary_document",
      "official_announcement",
      "original_research",
      "regulator",
      "credible_reporting",
    ],
    allowedDomains: (input.allowedDomains ?? []).slice(0, input.budget.maxDomains),
    excludedContext: ["SEO summaries without named sources", "Unattributed social reposts"],
    budget: input.budget,
  });
}

function normalizedUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function webSearchDetails(output: unknown) {
  const urls = new Set<string>();
  let calls = 0;
  if (!Array.isArray(output)) return { urls, calls };
  for (const item of output) {
    if (!item || typeof item !== "object" || !("type" in item)) continue;
    if (item.type !== "web_search_call") continue;
    calls += 1;
    if (!("action" in item) || !item.action || typeof item.action !== "object") continue;
    if ("sources" in item.action && Array.isArray(item.action.sources)) {
      for (const source of item.action.sources) {
        if (
          source &&
          typeof source === "object" &&
          "url" in source &&
          typeof source.url === "string"
        ) {
          try {
            urls.add(normalizedUrl(source.url));
          } catch {
            // Malformed provider URLs are ignored, then fail provenance validation if cited.
          }
        }
      }
    }
  }
  return { urls, calls };
}

function assertEvidenceIntegrity(
  evidencePackage: EvidencePackage,
  request: ResearchRequest,
  consultedUrls: Set<string>,
) {
  const allowedUrls = new Set(consultedUrls);
  if (request.originalSourceUrl) allowedUrls.add(normalizedUrl(request.originalSourceUrl));
  const uncited = evidencePackage.sources.filter(
    (source) => !allowedUrls.has(normalizedUrl(source.url)),
  );
  const integrity = validateEvidencePackageIntegrity(evidencePackage);
  if (uncited.length > 0) {
    integrity.issues.push(
      `Evidence cites ${uncited.length} URL(s) that were not returned by web search.`,
    );
  }
  if (evidencePackage.opportunityId !== request.plan.opportunityId) {
    integrity.issues.push("Evidence package belongs to a different opportunity.");
  }
  if (!integrity.ok || integrity.issues.length > 0) {
    throw new ResearchProviderError("invalid_evidence", integrity.issues.join(" "), false);
  }
}

function enforceEvidenceSafety(
  rawEvidence: unknown,
  request?: ResearchRequest,
  consultedUrls: Set<string> = new Set(),
) {
  const evidence = evidencePackageSchema.parse(rawEvidence);
  const allowedUrls = new Set(consultedUrls);
  if (request?.originalSourceUrl) allowedUrls.add(normalizedUrl(request.originalSourceUrl));
  const sources =
    request === undefined
      ? evidence.sources
      : evidence.sources.filter((source) => allowedUrls.has(normalizedUrl(source.url)));
  const retainedSourceKeys = new Set(sources.map((source) => source.sourceKey));
  const removedSources = evidence.sources.length - sources.length;
  const quarantined: string[] = [];
  let downgradedClaims = 0;
  let duplicateEvidenceLinks = 0;
  const claims = evidence.claims.map((claim) => {
    const sourceKeys = new Set<string>();
    const deduplicatedEvidence = claim.evidence.filter((item) => {
      if (!retainedSourceKeys.has(item.sourceKey)) return false;
      if (sourceKeys.has(item.sourceKey)) {
        duplicateEvidenceLinks += 1;
        return false;
      }
      sourceKeys.add(item.sourceKey);
      return true;
    });
    const lostVerifiedSupport =
      ["factual", "numerical"].includes(claim.claimType) &&
      claim.verificationState === "verified" &&
      !deduplicatedEvidence.some((item) => item.supportType === "supports");
    const normalizedClaim = lostVerifiedSupport
      ? {
          ...claim,
          evidence: deduplicatedEvidence,
          verificationState: "unsupported" as const,
          confidence: Math.min(claim.confidence, 0.25),
          usageGuidance: "do_not_use" as const,
          caveat:
            claim.caveat ??
            "Automatically blocked because its cited support was not in the consulted source set.",
        }
      : { ...claim, evidence: deduplicatedEvidence };
    if (lostVerifiedSupport) downgradedClaims += 1;
    if (
      normalizedClaim.riskLevel !== "high" ||
      normalizedClaim.verificationState === "verified" ||
      normalizedClaim.usageGuidance === "do_not_use"
    ) {
      return normalizedClaim;
    }
    quarantined.push(normalizedClaim.claimKey);
    return {
      ...normalizedClaim,
      usageGuidance: "do_not_use" as const,
      caveat:
        normalizedClaim.caveat ??
        "Automatically quarantined because this high-risk claim was not verified.",
    };
  });
  const hasUsableCore = claims.some(
    (claim) =>
      claim.importance === "core" &&
      claim.usageGuidance !== "do_not_use" &&
      !["unsupported", "disputed"].includes(claim.verificationState),
  );
  const hasBlockedCore = claims.some(
    (claim) =>
      claim.importance === "core" &&
      claim.usageGuidance !== "do_not_use" &&
      ["unsupported", "disputed"].includes(claim.verificationState),
  );
  const readyForWriting = hasUsableCore && !hasBlockedCore;
  return evidencePackageSchema.parse({
    ...evidence,
    sources,
    claims,
    caveats:
      quarantined.length > 0 ||
      duplicateEvidenceLinks > 0 ||
      removedSources > 0 ||
      downgradedClaims > 0
        ? [
            ...evidence.caveats,
            ...(removedSources > 0
              ? [
                  `Provenance enforcement removed ${removedSources} source(s) not present in the consulted source set.`,
                ]
              : []),
            ...(downgradedClaims > 0
              ? [
                  `Provenance enforcement downgraded ${downgradedClaims} claim(s) that lost verified support.`,
                ]
              : []),
            ...(duplicateEvidenceLinks > 0
              ? [
                  `Evidence normalization removed ${duplicateEvidenceLinks} duplicate claim-to-source link(s).`,
                ]
              : []),
            ...(quarantined.length > 0
              ? [
                  `Safety enforcement quarantined ${quarantined.length} unverified high-risk claim(s).`,
                ]
              : []),
            ...(readyForWriting !== evidence.readyForWriting
              ? [
                  `Writing readiness was deterministically recomputed as ${String(readyForWriting)} from the normalized claims ledger.`,
                ]
              : []),
          ]
        : readyForWriting !== evidence.readyForWriting
          ? [
              ...evidence.caveats,
              `Writing readiness was deterministically recomputed as ${String(readyForWriting)} from the normalized claims ledger.`,
            ]
          : evidence.caveats,
    readyForWriting,
  });
}

export class FakeResearchProvider implements ResearchProvider {
  async research(rawRequest: ResearchRequest): Promise<ResearchProviderResult> {
    const request = researchRequestSchema.parse(rawRequest);
    const now = "2026-07-23T12:00:00.000Z";
    const sourceUrl =
      request.originalSourceUrl ??
      `https://example.test/source/${createHash("sha256")
        .update(request.plan.opportunityId)
        .digest("hex")
        .slice(0, 12)}`;
    const sourceKey = "source_original1";
    const claimKey = "claim_original1";
    const evidencePackage = evidencePackageSchema.parse({
      contractVersion: "1.0",
      opportunityId: request.plan.opportunityId,
      summary:
        "The submitted source supports a usable editorial interpretation, but this deterministic test provider does not represent live external verification.",
      sources: [
        {
          sourceKey,
          url: sourceUrl,
          title: request.sourceTitle,
          publisher: "Submitted source",
          publishedAt: null,
          retrievedAt: now,
          sourceType: "source_material",
          authorityScore: 50,
          relevantExcerpt: request.sourceText.slice(0, 500),
        },
      ],
      claims: [
        {
          claimKey,
          text: request.sourceText.split(/[.!?]\s/)[0]?.slice(0, 1_000) || request.sourceTitle,
          claimType: "interpretation",
          importance: "core",
          riskLevel: "medium",
          verificationState: "partially_supported",
          confidence: 0.55,
          evidence: [
            {
              sourceKey,
              supportType: "context",
              excerpt: request.sourceText.slice(0, 500),
              locator: "Submitted source",
            },
          ],
          usageGuidance: "caveat",
          caveat: "External verification has not run in the deterministic test provider.",
        },
      ],
      conflicts: [],
      caveats: [
        "This is deterministic development evidence and must not be described as live web research.",
      ],
      readyForWriting: true,
    });
    const integrity = validateEvidencePackageIntegrity(evidencePackage);
    if (!integrity.ok) {
      throw new ResearchProviderError("invalid_evidence", integrity.issues.join(" "), false);
    }
    const outputTokens = approximateTokens(JSON.stringify(evidencePackage));
    const inputTokens = approximateTokens(
      JSON.stringify({ plan: request.plan, source: request.sourceText }),
    );
    return researchProviderResultSchema.parse({
      contractVersion: "1.0",
      evidencePackage,
      model: "fake-research-v1",
      promptVersion: EVIDENCE_SYNTHESIZER_PROMPT_VERSION,
      responseId: `fake_research_${createHash("sha256")
        .update(JSON.stringify(request))
        .digest("hex")
        .slice(0, 24)}`,
      usage: {
        inputTokens,
        outputTokens,
        webSearchCalls: 0,
        estimatedCostUsd: 0,
      },
      elapsedMs: 1,
    });
  }
}

export class OpenAIResearchProvider implements ResearchProvider {
  private readonly client: OpenAI;
  private readonly config: ResolvedResearchProviderConfig;

  constructor(rawConfig: ResearchProviderConfig, client?: OpenAI) {
    this.config = researchProviderConfigSchema.parse(rawConfig);
    this.client =
      client ??
      new OpenAI({
        apiKey: this.config.apiKey,
        maxRetries: this.config.maxRetries,
      });
  }

  async research(rawRequest: ResearchRequest): Promise<ResearchProviderResult> {
    const request = researchRequestSchema.parse(rawRequest);
    const preflightCost = estimateResearchCost(
      {
        inputTokens: approximateTokens(JSON.stringify(request)),
        outputTokens: request.plan.budget.maxOutputTokens,
        webSearchCalls: request.plan.budget.maxQueries,
      },
      this.config,
    );
    if (preflightCost > request.plan.budget.maxCostUsd) {
      throw new ResearchProviderError(
        "budget_exceeded",
        `Worst-case estimated research cost $${preflightCost} exceeds the run budget.`,
        false,
      );
    }

    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.plan.budget.maxElapsedMs);
    let providerTrace: ResearchProviderTrace | undefined;
    try {
      const response = await this.client.responses.parse(
        {
          model: this.config.model,
          reasoning: { effort: this.config.reasoningEffort },
          instructions: EVIDENCE_SYNTHESIZER_SYSTEM_PROMPT,
          input: `Execute only the bounded research plan below. Use no more than ${request.plan.budget.maxQueries} search actions and return no more than ${request.plan.budget.maxResults} sources.

RESEARCH_PLAN
${JSON.stringify(request.plan)}
END_RESEARCH_PLAN

SOURCE_DATA
Title: ${request.sourceTitle}
Original URL: ${request.originalSourceUrl ?? "not supplied"}
Text:
${request.sourceText}
END_SOURCE_DATA`,
          tools: [
            {
              type: "web_search",
              search_context_size: "low",
              ...(request.plan.allowedDomains.length > 0
                ? { filters: { allowed_domains: request.plan.allowedDomains } }
                : {}),
            },
          ],
          tool_choice: "required",
          parallel_tool_calls: false,
          include: ["web_search_call.action.sources"],
          text: {
            format: zodTextFormat(providerEvidencePackageSchema, "evidence_package"),
          },
          max_output_tokens: request.plan.budget.maxOutputTokens,
          store: false,
        },
        { signal: controller.signal },
      );
      const details = webSearchDetails(response.output);
      const usage = {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        webSearchCalls: details.calls,
      };
      providerTrace = {
        model: response.model,
        promptVersion: EVIDENCE_SYNTHESIZER_PROMPT_VERSION,
        responseId: response.id,
        usage: {
          ...usage,
          estimatedCostUsd: estimateResearchCost(usage, this.config),
        },
      };

      if (!response.output_parsed) {
        const refused = response.output.some(
          (item) =>
            item.type === "message" && item.content.some((content) => content.type === "refusal"),
        );
        throw new ResearchProviderError(
          refused
            ? "provider_refusal"
            : response.status === "incomplete"
              ? "provider_truncated"
              : "invalid_evidence",
          refused
            ? "The research provider refused the request."
            : response.status === "incomplete"
              ? "The research provider reached its bounded output limit."
              : "The research provider returned no structured evidence package.",
          response.status === "incomplete",
        );
      }

      const evidencePackage = enforceEvidenceSafety(response.output_parsed, request, details.urls);
      if (details.calls > request.plan.budget.maxQueries) {
        throw new ResearchProviderError(
          "budget_exceeded",
          "The provider exceeded the permitted number of web-search calls.",
          false,
        );
      }
      if (evidencePackage.sources.length > request.plan.budget.maxResults) {
        throw new ResearchProviderError(
          "budget_exceeded",
          "The provider exceeded the permitted number of research sources.",
          false,
        );
      }
      assertEvidenceIntegrity(evidencePackage, request, details.urls);

      const estimatedCostUsd = providerTrace.usage.estimatedCostUsd;
      if (estimatedCostUsd > request.plan.budget.maxCostUsd) {
        throw new ResearchProviderError(
          "budget_exceeded",
          "Actual provider usage exceeded the permitted research cost.",
          false,
        );
      }

      return researchProviderResultSchema.parse({
        contractVersion: "1.0",
        evidencePackage,
        model: response.model,
        promptVersion: EVIDENCE_SYNTHESIZER_PROMPT_VERSION,
        responseId: response.id,
        usage: { ...usage, estimatedCostUsd },
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      if (error instanceof ResearchProviderError) {
        error.trace ??= providerTrace;
        throw error;
      }
      if (
        controller.signal.aborted ||
        (error instanceof Error && error.name === "AbortError") ||
        error instanceof OpenAI.APIConnectionTimeoutError
      ) {
        throw new ResearchProviderError(
          "provider_timeout",
          "The bounded research request timed out.",
          true,
        );
      }
      if (error instanceof OpenAI.RateLimitError) {
        throw new ResearchProviderError(
          "provider_rate_limited",
          "The research provider rate limit was reached.",
          true,
        );
      }
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        throw new ResearchProviderError(
          "invalid_evidence",
          "The research provider returned malformed structured evidence.",
          false,
          providerTrace,
        );
      }
      throw new ResearchProviderError(
        "provider_error",
        error instanceof Error ? error.message : "The research provider failed.",
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
