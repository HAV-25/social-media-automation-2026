import type { NormalizedBrandContext } from "@content-engine/brand-memory";
import {
  contentStyleSchema,
  editorialGenerationSchema,
  fakeDraftOutputSchema,
  toneSchema,
  type EvidencePackage,
  type FakeDraftOutput,
} from "@content-engine/contracts";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  FACEBOOK_WRITER_PROMPT_VERSION,
  FACEBOOK_WRITER_SYSTEM_PROMPT,
} from "./prompts/facebook-writer.v1";
import { createEditorialAngles, evaluateEditorialDraft } from "./editorial";

export { FACEBOOK_WRITER_PROMPT_VERSION, FACEBOOK_WRITER_SYSTEM_PROMPT };
export {
  createEditorialAngles,
  editorialSimilarity,
  evaluateEditorialDraft,
  selectivelyRegeneratePost,
} from "./editorial";
export {
  buildLeanResearchPlan,
  estimateResearchCost,
  FakeResearchProvider,
  OpenAIResearchProvider,
  researchProviderConfigSchema,
  researchRequestSchema,
  ResearchProviderError,
  type ResearchProvider,
  type ResearchProviderConfig,
  type ResearchRequest,
} from "./research";
export {
  EVIDENCE_SYNTHESIZER_PROMPT_VERSION,
  EVIDENCE_SYNTHESIZER_SYSTEM_PROMPT,
} from "./prompts/evidence-synthesizer.v1";
export {
  RESEARCH_PLANNER_PROMPT_VERSION,
  RESEARCH_PLANNER_SYSTEM_PROMPT,
} from "./prompts/research-planner.v1";
export {
  OPPORTUNITY_ANALYST_PROMPT_VERSION,
  OPPORTUNITY_ANALYST_SYSTEM_PROMPT,
} from "./prompts/opportunity-analyst.v1";
export {
  SOURCE_ANALYST_PROMPT_VERSION,
  SOURCE_ANALYST_SYSTEM_PROMPT,
} from "./prompts/source-analyst.v1";
export { getProductionPrompt, PRODUCTION_PROMPTS } from "./prompts/registry";
export {
  DEFAULT_RESEARCH_EVAL_THRESHOLDS,
  evaluateResearchResult,
  type ResearchEvalThresholds,
} from "./evals";
export {
  createImageDirection,
  FakeImageDirector,
  FakeImageProvider,
  imageDirectorConfigSchema,
  imageProviderConfigSchema,
  imageProviderRequestSchema,
  ImageProviderError,
  OpenAIImageDirector,
  OpenAIImageProvider,
  sanitizeImageDisplayText,
  type ImageDirector,
  type ImageDirectorConfig,
  type ImageDirectionRequest,
  type ImageProvider,
  type ImageProviderConfig,
  type ImageProviderRequest,
} from "./image";
export {
  IMAGE_DIRECTOR_PROMPT_VERSION,
  IMAGE_DIRECTOR_SYSTEM_PROMPT,
} from "./prompts/image-director.v1";

export const draftRequestSchema = z.object({
  opportunityId: z.string().min(1),
  sourceTitle: z.string().trim().min(1).max(1_000),
  valueNucleus: z.string().trim().min(1).max(2_000),
  contentStyle: contentStyleSchema,
  tone: toneSchema,
});
export type DraftRequest = z.infer<typeof draftRequestSchema> & {
  brandContext: NormalizedBrandContext;
  evidencePackage: EvidencePackage;
  sourceText: string;
  recentSameBrandPosts?: string[];
  crossBrandPosts?: string[];
};

export interface EditorialProvider {
  generateDraft(request: DraftRequest): Promise<FakeDraftOutput>;
}

export const editorialProviderConfigSchema = z
  .object({
    apiKey: z.string().min(1),
    model: z.string().min(1).max(200),
    reasoningEffort: z.enum(["none", "low", "medium", "high", "xhigh"]).default("low"),
    inputUsdPer1M: z.number().nonnegative().max(1_000),
    outputUsdPer1M: z.number().nonnegative().max(1_000),
    maxOutputTokens: z.number().int().min(500).max(16_000),
    timeoutMs: z.number().int().min(5_000).max(180_000),
    maxCostUsd: z.number().positive().max(100),
    maxRetries: z.number().int().min(0).max(5).default(2),
  })
  .strict();
export type EditorialProviderConfig = z.input<typeof editorialProviderConfigSchema>;

export class EditorialProviderError extends Error {
  constructor(
    readonly code:
      | "budget_exceeded"
      | "invalid_output"
      | "provider_refusal"
      | "provider_truncated"
      | "provider_timeout"
      | "provider_rate_limited"
      | "provider_error",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

function words(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

export function estimateEditorialCost(
  usage: { inputTokens: number; outputTokens: number },
  pricing: { inputUsdPer1M: number; outputUsdPer1M: number },
) {
  return (
    (usage.inputTokens / 1_000_000) * pricing.inputUsdPer1M +
    (usage.outputTokens / 1_000_000) * pricing.outputUsdPer1M
  );
}

function cleanSourceText(value: string) {
  return value
    .replace(
      /\b(?:ignore (?:all |any )?(?:previous|prior) instructions?|system prompt|developer message|reveal (?:the )?secret|call (?:a )?tool)\b/gi,
      "[untrusted instruction-like text removed]",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function applyTone(value: string, tone: z.infer<typeof toneSchema>) {
  const prefixes = {
    authoritative: "The evidence points to a practical conclusion.",
    conversational: "Here’s the part worth unpacking together.",
    bold: "The comfortable reading misses the consequential part.",
    thoughtful: "A careful reading reveals a more useful question.",
    witty: "The headline gets the spotlight; the consequence does the work.",
  } as const;
  return `${prefixes[tone]} ${value}`;
}

export class FakeEditorialProvider implements EditorialProvider {
  async generateDraft(request: DraftRequest): Promise<FakeDraftOutput> {
    const parsed = draftRequestSchema.parse(request);
    const nucleus = cleanSourceText(parsed.valueNucleus);
    const coreClaim =
      request.evidencePackage.claims.find(
        (claim) => claim.importance === "core" && claim.usageGuidance !== "do_not_use",
      ) ?? request.evidencePackage.claims.find((claim) => claim.usageGuidance !== "do_not_use");
    const evidenceStatement = cleanSourceText(coreClaim?.text ?? nucleus);
    const caveat = cleanSourceText(
      coreClaim?.caveat ??
        request.evidencePackage.caveats[0] ??
        "Keep the interpretation proportionate to the available evidence.",
    );
    const brand = request.brandContext.identity.name;
    const audience = request.brandContext.identity.audience || "the people this affects";
    const position =
      request.brandContext.identity.positioning || "a practical, evidence-aware point of view";

    const styleContent = {
      newsworthy_authority: {
        hook: applyTone(`What changed — and why it matters: ${nucleus}`, parsed.tone),
        body: `${evidenceStatement}.\n\nThe immediate headline is only part of the story. For ${audience}, the useful question is what this changes in practice. ${brand} examines the consequence before reaching for a prediction.\n\nEvidence note: ${caveat}`,
        closing: "What consequence deserves the closest attention next?",
      },
      educational_breakdown: {
        hook: applyTone(`A practical lesson hidden inside this idea: ${nucleus}`, parsed.tone),
        body: `${evidenceStatement}.\n\nThree useful lenses:\n\n1. Identify the decision that is changing.\n2. Separate the supported claim from the interpretation.\n3. Ask what the audience can do differently.\n\nThat structure reflects ${position}. Evidence note: ${caveat}`,
        closing: "Which of these three lenses would you apply first?",
      },
      perspective_conversation: {
        hook: applyTone(`The bigger shift may not be the obvious one. ${nucleus}`, parsed.tone),
        body: `${evidenceStatement}.\n\n${brand}'s perspective is to look beyond the surface claim and ask how behaviour, decisions, or expectations might change. For ${audience}, that interpretation is worth discussing.\n\nEvidence note: ${caveat}`,
        closing: "Do you see the same shift, or a different one?",
      },
    } as const;
    const selected = styleContent[parsed.contentStyle];
    const fullText = [selected.hook, selected.body, selected.closing].join("\n\n");
    const angles = createEditorialAngles(nucleus, request.evidencePackage);
    const selectedAngle = angles.find((angle) => angle.contentStyle === parsed.contentStyle)!;
    const evaluation = evaluateEditorialDraft({
      content: { ...selected, fullText },
      brandContext: request.brandContext,
      evidence: request.evidencePackage,
      sourceText: request.sourceText,
      recentSameBrandPosts: request.recentSameBrandPosts,
      crossBrandPosts: request.crossBrandPosts,
    });
    const responseId = `fake_${createHash("sha256")
      .update(
        `${parsed.opportunityId}:${parsed.contentStyle}:${parsed.tone}:${request.brandContext.brandId}`,
      )
      .digest("hex")
      .slice(0, 24)}`;

    return fakeDraftOutputSchema.parse({
      contractVersion: "1.0",
      contentStyle: parsed.contentStyle,
      tone: parsed.tone,
      angles,
      selectedAngleKey: selectedAngle.angleKey,
      content: { ...selected, fullText },
      evaluation,
      revisionCount: 0,
      model: "fake-editorial-v1",
      promptVersion: FACEBOOK_WRITER_PROMPT_VERSION,
      responseId,
      usage: {
        inputTokens: words(
          JSON.stringify({
            sourceTitle: parsed.sourceTitle,
            valueNucleus: parsed.valueNucleus,
            brandContext: request.brandContext,
          }),
        ),
        outputTokens: words(fullText),
      },
    });
  }
}

export class OpenAIEditorialProvider implements EditorialProvider {
  private readonly client: OpenAI;
  private readonly config: z.output<typeof editorialProviderConfigSchema>;

  constructor(rawConfig: EditorialProviderConfig, client?: OpenAI) {
    this.config = editorialProviderConfigSchema.parse(rawConfig);
    this.client =
      client ??
      new OpenAI({
        apiKey: this.config.apiKey,
        maxRetries: this.config.maxRetries,
      });
  }

  async generateDraft(rawRequest: DraftRequest): Promise<FakeDraftOutput> {
    const parsed = draftRequestSchema.parse(rawRequest);
    const input = `Create exactly three ranked, materially different angles and one final Facebook post for the requested style and tone. Internally critique and revise no more than twice.

REQUEST
Style: ${parsed.contentStyle}
Tone: ${parsed.tone}
Opportunity ID: ${parsed.opportunityId}
END_REQUEST

SOURCE_DATA
Title: ${parsed.sourceTitle}
Value nucleus: ${parsed.valueNucleus}
Text: ${rawRequest.sourceText}
END_SOURCE_DATA

RESEARCH_DATA
${JSON.stringify(rawRequest.evidencePackage)}
END_RESEARCH_DATA

BRAND_CONTEXT
${JSON.stringify(rawRequest.brandContext)}
END_BRAND_CONTEXT`;
    const preflightCost = estimateEditorialCost(
      {
        inputTokens: words(input),
        outputTokens: this.config.maxOutputTokens,
      },
      this.config,
    );
    if (preflightCost > this.config.maxCostUsd) {
      throw new EditorialProviderError(
        "budget_exceeded",
        `Worst-case estimated writing cost $${preflightCost.toFixed(4)} exceeds the run budget.`,
        false,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.client.responses.parse(
        {
          model: this.config.model,
          reasoning: { effort: this.config.reasoningEffort },
          instructions: FACEBOOK_WRITER_SYSTEM_PROMPT,
          input,
          text: {
            format: zodTextFormat(editorialGenerationSchema, "editorial_generation"),
          },
          max_output_tokens: this.config.maxOutputTokens,
          store: false,
        },
        { signal: controller.signal },
      );
      if (!response.output_parsed) {
        const refused = response.output.some(
          (item) =>
            item.type === "message" && item.content.some((content) => content.type === "refusal"),
        );
        throw new EditorialProviderError(
          refused
            ? "provider_refusal"
            : response.status === "incomplete"
              ? "provider_truncated"
              : "invalid_output",
          refused
            ? "The writing provider refused the request."
            : response.status === "incomplete"
              ? "The writing provider reached its bounded output limit."
              : "The writing provider returned no structured output.",
          response.status === "incomplete",
        );
      }
      const generated = editorialGenerationSchema.parse(response.output_parsed);
      const selectedAngle = generated.angles.find(
        (angle) => angle.angleKey === generated.selectedAngleKey,
      );
      const knownClaimKeys = new Set(
        rawRequest.evidencePackage.claims.map((claim) => claim.claimKey),
      );
      if (
        generated.contentStyle !== parsed.contentStyle ||
        generated.tone !== parsed.tone ||
        selectedAngle?.contentStyle !== parsed.contentStyle ||
        new Set(generated.angles.map((angle) => angle.angleKey)).size !== 3 ||
        generated.angles.some((angle) =>
          angle.supportingClaimKeys.some((claimKey) => !knownClaimKeys.has(claimKey)),
        ) ||
        generated.content.fullText !==
          [generated.content.hook, generated.content.body, generated.content.closing]
            .filter(Boolean)
            .join("\n\n")
      ) {
        throw new EditorialProviderError(
          "invalid_output",
          "The writing provider returned inconsistent style, angle, content, or claim provenance.",
          false,
        );
      }
      const evaluation = evaluateEditorialDraft({
        content: generated.content,
        brandContext: rawRequest.brandContext,
        evidence: rawRequest.evidencePackage,
        sourceText: rawRequest.sourceText,
        recentSameBrandPosts: rawRequest.recentSameBrandPosts,
        crossBrandPosts: rawRequest.crossBrandPosts,
      });
      const usage = {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      };
      const estimatedCostUsd = estimateEditorialCost(usage, this.config);
      if (estimatedCostUsd > this.config.maxCostUsd) {
        throw new EditorialProviderError(
          "budget_exceeded",
          "Actual writing-provider usage exceeded the permitted cost.",
          false,
        );
      }
      return fakeDraftOutputSchema.parse({
        ...generated,
        evaluation,
        model: response.model,
        promptVersion: FACEBOOK_WRITER_PROMPT_VERSION,
        responseId: response.id,
        usage: { ...usage, estimatedCostUsd },
      });
    } catch (error) {
      if (error instanceof EditorialProviderError) throw error;
      if (controller.signal.aborted) {
        throw new EditorialProviderError(
          "provider_timeout",
          "The writing provider exceeded its time limit.",
          true,
        );
      }
      if (error instanceof OpenAI.APIError && error.status === 429) {
        throw new EditorialProviderError(
          "provider_rate_limited",
          "The writing provider rate-limited the request.",
          true,
        );
      }
      if (error instanceof z.ZodError) {
        throw new EditorialProviderError(
          "invalid_output",
          "The writing provider returned malformed structured output.",
          false,
        );
      }
      throw new EditorialProviderError("provider_error", "The writing provider failed.", true);
    } finally {
      clearTimeout(timeout);
    }
  }
}
