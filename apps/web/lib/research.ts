import "server-only";
import {
  buildLeanResearchPlan,
  FakeResearchProvider,
  OpenAIResearchProvider,
  ResearchProviderError,
  type ResearchProvider,
} from "@content-engine/ai";
import {
  evidencePackageSchema,
  researchBudgetReservationResultSchema,
  researchRunResultSchema,
  serverEnvSchema,
  type ResearchProviderResult,
  type ResearchRunResult,
} from "@content-engine/contracts";
import { redactSensitiveText, sha256Hex } from "@content-engine/security";
import { cookies } from "next/headers";
import { z } from "zod";
import { parseDemoResearchRecords } from "./demo-content-store";
import type { OpportunityDetail } from "./opportunity-detail";
import { createSupabaseServerClient } from "./supabase/server";
import { createSupabaseServiceClient } from "./supabase/service";

const researchRpcRowSchema = z.object({
  research_run_id: z.uuid(),
  generation_run_id: z.uuid(),
  duplicate: z.boolean(),
  ready_for_writing: z.boolean(),
  source_count: z.number().int().nonnegative(),
  claim_count: z.number().int().nonnegative(),
});
const researchReservationRowSchema = z.object({
  generation_run_id: z.uuid(),
  duplicate: z.boolean(),
  reserved_cost_usd: z.coerce.number().nonnegative(),
  spent_today_usd: z.coerce.number().nonnegative(),
  daily_budget_usd: z.coerce.number().positive(),
});

export function createResearchProvider(): ResearchProvider {
  const env = serverEnvSchema.parse(process.env);
  if (env.AI_PROVIDER === "fake") return new FakeResearchProvider();
  if (!env.OPENAI_API_KEY) {
    throw new Error("AI_PROVIDER=openai requires OPENAI_API_KEY.");
  }
  if (!env.AI_RESEARCH_EVAL_BASELINE_ID) {
    throw new Error("AI_PROVIDER=openai requires an accepted AI_RESEARCH_EVAL_BASELINE_ID.");
  }
  return new OpenAIResearchProvider({
    apiKey: env.OPENAI_API_KEY,
    model: env.AI_MODEL_RESEARCH,
    reasoningEffort: env.AI_RESEARCH_REASONING_EFFORT,
    inputUsdPer1M: env.AI_INPUT_USD_PER_1M,
    outputUsdPer1M: env.AI_OUTPUT_USD_PER_1M,
    webSearchUsdPerCall: env.AI_WEB_SEARCH_USD_PER_CALL,
    maxRetries: env.AI_PROVIDER_MAX_RETRIES,
  });
}

const researchOpportunityRowSchema = z.object({
  id: z.uuid(),
  brand_id: z.uuid(),
  value_nucleus: z.string(),
  opportunity_score: z.coerce.number(),
  risk_penalty: z.coerce.number(),
  status: z.string(),
  recommended_style: z.string().nullable(),
  created_at: z.string(),
  source_documents: z
    .object({
      title: z.string().nullable(),
      source_type: z.string(),
      clean_text: z.string().nullable(),
      language: z.string().nullable(),
      canonical_url: z.string().nullable(),
      metadata: z.unknown(),
    })
    .nullable(),
});

export async function getOpportunityForWorkflow(
  opportunityId: string,
): Promise<OpportunityDetail | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select(
      "id,brand_id,value_nucleus,opportunity_score,risk_penalty,status,recommended_style,created_at,source_documents(title,source_type,clean_text,language,canonical_url,metadata)",
    )
    .eq("id", opportunityId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = researchOpportunityRowSchema.parse(data);
  const metadata = z
    .object({
      namedEntities: z.array(z.string()).max(20).default([]),
      topicTags: z.array(z.string()).max(8).default([]),
      classificationReasons: z.array(z.string()).max(5).default([]),
    })
    .parse(row.source_documents?.metadata ?? {});
  return {
    id: row.id,
    brandId: row.brand_id,
    title: row.source_documents?.title ?? "Untitled source",
    sourceType: row.source_documents?.source_type ?? "unknown",
    cleanText: row.source_documents?.clean_text ?? "",
    language: row.source_documents?.language ?? "und",
    canonicalUrl: row.source_documents?.canonical_url ?? undefined,
    createdAt: row.created_at,
    valueNucleus: row.value_nucleus,
    score: row.opportunity_score,
    riskPenalty: row.risk_penalty,
    status: row.status,
    recommendedStyle: row.recommended_style ?? "perspective_conversation",
    namedEntities: metadata.namedEntities,
    topicTags: metadata.topicTags,
    classificationReasons: metadata.classificationReasons,
    dimensions: [],
    riskReasons: [],
  };
}

export async function produceResearchEvidence(input: {
  opportunity: OpportunityDetail;
  allowedDomains: string[];
  plan?: ReturnType<typeof buildLeanResearchPlan>;
  provider?: ResearchProvider;
}) {
  const plan = input.plan ?? createResearchPlan(input.opportunity, input.allowedDomains);
  const provider = input.provider ?? createResearchProvider();
  const result = await provider.research({
    plan,
    sourceTitle: input.opportunity.title,
    sourceText: input.opportunity.cleanText.slice(0, 120_000),
    originalSourceUrl: input.opportunity.canonicalUrl,
  });
  return { plan, result };
}

export function createResearchPlan(opportunity: OpportunityDetail, allowedDomains: string[]) {
  const env = serverEnvSchema.parse(process.env);
  return buildLeanResearchPlan({
    opportunityId: opportunity.id,
    sourceTitle: opportunity.title,
    valueNucleus: opportunity.valueNucleus,
    namedEntities: opportunity.namedEntities,
    allowedDomains,
    budget: {
      maxQueries: env.AI_RESEARCH_MAX_QUERIES,
      maxDomains: env.AI_RESEARCH_MAX_DOMAINS,
      maxResults: env.AI_RESEARCH_MAX_RESULTS,
      maxElapsedMs: env.AI_RESEARCH_TIMEOUT_MS,
      maxOutputTokens: env.AI_RESEARCH_MAX_OUTPUT_TOKENS,
      maxCostUsd: env.AI_PER_RUN_BUDGET_USD,
    },
  });
}

export async function reserveResearchBudget(input: {
  actorId: string;
  brandId: string;
  correlationId: string;
  idempotencyKey: string;
  opportunityId: string;
  plan: ReturnType<typeof buildLeanResearchPlan>;
}) {
  const env = serverEnvSchema.parse(process.env);
  const requestHash = sha256Hex(
    JSON.stringify({
      actorId: input.actorId,
      brandId: input.brandId,
      opportunityId: input.opportunityId,
      plan: input.plan,
    }),
  );
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .rpc("reserve_research_budget", {
      payload: {
        actorId: input.actorId,
        brandId: input.brandId,
        correlationId: input.correlationId,
        opportunityId: input.opportunityId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        reservedCostUsd: input.plan.budget.maxCostUsd,
        dailyBudgetUsd: env.AI_DAILY_BUDGET_USD,
      },
    })
    .single();
  if (error) throw error;
  const row = researchReservationRowSchema.parse(data);
  return researchBudgetReservationResultSchema.parse({
    generationRunId: row.generation_run_id,
    duplicate: row.duplicate,
    reservedCostUsd: row.reserved_cost_usd,
    spentTodayUsd: row.spent_today_usd,
    dailyBudgetUsd: row.daily_budget_usd,
  });
}

export async function failResearchRun(input: {
  actorId: string;
  generationRunId: string;
  error: unknown;
}) {
  const code =
    input.error && typeof input.error === "object" && "code" in input.error
      ? String(input.error.code)
      : "research_failed";
  const message =
    input.error instanceof Error ? input.error.message : "The research provider failed.";
  const retryable =
    input.error instanceof Error &&
    "retryable" in input.error &&
    typeof input.error.retryable === "boolean"
      ? input.error.retryable
      : false;
  const trace = input.error instanceof ResearchProviderError ? input.error.trace : undefined;
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.rpc("fail_research_run", {
    payload: {
      actorId: input.actorId,
      generationRunId: input.generationRunId,
      errorCode: code.slice(0, 120),
      message: redactSensitiveText(message, 1_000),
      retryable,
      model: trace?.model,
      promptVersion: trace?.promptVersion,
      responseId: trace?.responseId,
      usage: trace?.usage,
    },
  });
  if (error) throw error;
}

export async function getResearchResultForGenerationRun(
  generationRunId: string,
): Promise<ResearchRunResult | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("research_runs")
    .select("id,generation_run_id,ready_for_writing,evidence_package,status")
    .eq("generation_run_id", generationRunId)
    .eq("status", "succeeded")
    .maybeSingle();
  if (error) throw error;
  if (!data?.evidence_package || !data.generation_run_id) return null;
  const evidence = evidencePackageSchema.parse(data.evidence_package);
  return researchRunResultSchema.parse({
    contractVersion: "1.0",
    researchRunId: data.id,
    generationRunId: data.generation_run_id,
    status: data.ready_for_writing ? "evidence_ready" : "review_required",
    duplicate: true,
    readyForWriting: data.ready_for_writing,
    sourceCount: evidence.sources.length,
    claimCount: evidence.claims.length,
  });
}

export async function persistResearchEvidence(input: {
  actorId: string;
  brandId: string;
  correlationId: string;
  idempotencyKey: string;
  generationRunId: string;
  opportunityId: string;
  plan: ReturnType<typeof buildLeanResearchPlan>;
  providerResult: ResearchProviderResult;
}): Promise<ResearchRunResult> {
  const requestHash = sha256Hex(
    JSON.stringify({
      actorId: input.actorId,
      brandId: input.brandId,
      opportunityId: input.opportunityId,
      researchPlan: input.plan,
      promptVersion: input.providerResult.promptVersion,
    }),
  );
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .rpc("persist_research_evidence", {
      payload: {
        actorId: input.actorId,
        brandId: input.brandId,
        correlationId: input.correlationId,
        opportunityId: input.opportunityId,
        generationRunId: input.generationRunId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        researchPlan: input.plan,
        evidencePackage: input.providerResult.evidencePackage,
        model: input.providerResult.model,
        promptVersion: input.providerResult.promptVersion,
        responseId: input.providerResult.responseId,
        usage: input.providerResult.usage,
      },
    })
    .single();
  if (error) throw error;
  const row = researchRpcRowSchema.parse(data);
  return researchRunResultSchema.parse({
    contractVersion: "1.0",
    researchRunId: row.research_run_id,
    generationRunId: row.generation_run_id,
    status: row.ready_for_writing ? "evidence_ready" : "review_required",
    duplicate: row.duplicate,
    readyForWriting: row.ready_for_writing,
    sourceCount: row.source_count,
    claimCount: row.claim_count,
  });
}

export type ResearchEvidenceView = {
  evidencePackage: z.infer<typeof evidencePackageSchema>;
  model: string;
  promptVersion: string;
  responseId: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    webSearchCalls: number;
    estimatedCostUsd: number;
  };
  simulated: boolean;
};

const researchUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  webSearchCalls: z.number().int().nonnegative().default(0),
  estimatedCostUsd: z.number().nonnegative().default(0),
});

function mapResearchEvidence(data: {
  evidence_package: unknown;
  model: string | null;
  prompt_version: string | null;
  provider_response_id: string | null;
  provider_usage: unknown;
}): ResearchEvidenceView {
  return {
    evidencePackage: evidencePackageSchema.parse(data.evidence_package),
    model: data.model ?? "unknown",
    promptVersion: data.prompt_version ?? "unknown",
    responseId: data.provider_response_id ?? "unknown",
    usage: researchUsageSchema.parse(data.provider_usage),
    simulated: false,
  };
}

export async function getResearchEvidence(
  opportunityId: string,
): Promise<ResearchEvidenceView | null> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const cookieStore = await cookies();
    const record = parseDemoResearchRecords(cookieStore.get("demo-research-records")?.value).find(
      (candidate) => candidate.opportunityId === opportunityId,
    );
    return record
      ? {
          evidencePackage: record.evidencePackage,
          model: record.model,
          promptVersion: record.promptVersion,
          responseId: record.responseId,
          usage: record.usage,
          simulated: true,
        }
      : null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("research_runs")
    .select(
      "evidence_package,model,prompt_version,provider_response_id,provider_usage,completed_at",
    )
    .eq("opportunity_id", opportunityId)
    .eq("status", "succeeded")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Unable to load research evidence: ${error.message}`);
  if (!data?.evidence_package) return null;
  return mapResearchEvidence(data);
}

export async function getResearchEvidenceForWorkflow(
  opportunityId: string,
): Promise<ResearchEvidenceView | null> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    return getResearchEvidence(opportunityId);
  }
  const { data, error } = await createSupabaseServiceClient()
    .from("research_runs")
    .select(
      "evidence_package,model,prompt_version,provider_response_id,provider_usage,completed_at",
    )
    .eq("opportunity_id", opportunityId)
    .eq("status", "succeeded")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Unable to load research evidence: ${error.message}`);
  if (!data?.evidence_package) return null;
  return mapResearchEvidence(data);
}
