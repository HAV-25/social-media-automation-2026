import "server-only";
import {
  EditorialProviderError,
  FakeEditorialProvider,
  OpenAIEditorialProvider,
  evaluateEditorialDraft,
  generateEditorialDraftBatch,
  selectivelyRegeneratePost,
} from "@content-engine/ai";
import {
  draftGenerationResultSchema,
  editorialWorkflowResultSchema,
  postContentSchema,
  postRegenerationResultSchema,
  postVerificationWorkflowResultSchema,
  serverEnvSchema,
  type EditorialWorkflowRequest,
  type PostActionWorkflowRequest,
  type PostVerificationWorkflowRequest,
} from "@content-engine/contracts";
import { sha256Hex } from "@content-engine/security";
import { z } from "zod";
import { getBrandConfigurationForWorkflow } from "./brand-configuration";
import { getOpportunityForWorkflow, getResearchEvidenceForWorkflow } from "./research";
import { createSupabaseServiceClient } from "./supabase/service";

export class EditorialWorkflowError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "EditorialWorkflowError";
  }
}

const draftRpcRowSchema = z.object({
  post_draft_id: z.uuid(),
  post_version_id: z.uuid(),
  generation_run_id: z.uuid(),
  duplicate: z.boolean(),
});

const verificationRpcRowSchema = z.object({
  post_draft_id: z.uuid(),
  post_version_id: z.uuid(),
  duplicate: z.boolean(),
});

const regenerationRpcRowSchema = z.object({
  post_draft_id: z.uuid(),
  post_version_id: z.uuid(),
  version_number: z.number().int().positive(),
  duplicate: z.boolean(),
});

async function assertWorkflowEditor(input: {
  actorId: string;
  brandId: string;
  organizationId: string;
}) {
  const supabase = createSupabaseServiceClient();
  const [
    { data: organizationMember, error: organizationError },
    { data: brandMember, error: brandError },
  ] = await Promise.all([
    supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", input.organizationId)
      .eq("user_id", input.actorId)
      .maybeSingle(),
    supabase
      .from("brand_members")
      .select("role")
      .eq("brand_id", input.brandId)
      .eq("user_id", input.actorId)
      .maybeSingle(),
  ]);
  if (organizationError ?? brandError) {
    throw new EditorialWorkflowError(
      "authorization_lookup_failed",
      "Editorial workflow authorization could not be checked.",
      500,
    );
  }
  const allowed =
    organizationMember?.role === "administrator" ||
    ["administrator", "editor"].includes(brandMember?.role ?? "");
  if (!organizationMember || !allowed) {
    throw new EditorialWorkflowError(
      "editor_role_required",
      "The workflow actor is not an editor for this brand.",
      403,
    );
  }
}

async function getSimilarityContext(brandId: string, excludePostDraftId?: string) {
  const supabase = createSupabaseServiceClient();
  let draftQuery = supabase
    .from("post_drafts")
    .select("id,brand_id,current_version_id")
    .not("current_version_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (excludePostDraftId) draftQuery = draftQuery.neq("id", excludePostDraftId);
  const { data: drafts, error: draftError } = await draftQuery;
  if (draftError) {
    throw new EditorialWorkflowError(
      "similarity_context_failed",
      "Recent post similarity context could not be loaded.",
      500,
    );
  }
  const versionIds = (drafts ?? [])
    .map((draft) => draft.current_version_id)
    .filter((id): id is string => Boolean(id));
  const { data: versions, error: versionError } = versionIds.length
    ? await supabase.from("post_versions").select("id,full_text").in("id", versionIds)
    : { data: [], error: null };
  if (versionError) {
    throw new EditorialWorkflowError(
      "similarity_context_failed",
      "Recent post versions could not be loaded.",
      500,
    );
  }
  const textByVersion = new Map((versions ?? []).map((version) => [version.id, version.full_text]));
  return {
    recentSameBrandPosts: (drafts ?? [])
      .filter((draft) => draft.brand_id === brandId)
      .map((draft) => textByVersion.get(draft.current_version_id ?? ""))
      .filter((text): text is string => Boolean(text)),
    crossBrandPosts: (drafts ?? [])
      .filter((draft) => draft.brand_id !== brandId)
      .map((draft) => textByVersion.get(draft.current_version_id ?? ""))
      .filter((text): text is string => Boolean(text)),
  };
}

function createEditorialProvider() {
  const env = serverEnvSchema.parse(process.env);
  if (env.AI_PROVIDER === "fake") return new FakeEditorialProvider();
  if (!env.OPENAI_API_KEY) {
    throw new EditorialWorkflowError(
      "openai_key_required",
      "Production writing requires a server-side OpenAI API key.",
      503,
    );
  }
  if (!env.AI_EDITORIAL_EVAL_BASELINE_ID) {
    throw new EditorialWorkflowError(
      "editorial_baseline_required",
      "Production writing requires an accepted editorial evaluation baseline.",
      503,
    );
  }
  return new OpenAIEditorialProvider({
    apiKey: env.OPENAI_API_KEY,
    model: env.AI_MODEL_WRITE,
    reasoningEffort: env.AI_WRITE_REASONING_EFFORT,
    inputUsdPer1M: env.AI_INPUT_USD_PER_1M,
    outputUsdPer1M: env.AI_OUTPUT_USD_PER_1M,
    maxOutputTokens: env.AI_WRITE_MAX_OUTPUT_TOKENS,
    timeoutMs: env.AI_WRITE_TIMEOUT_MS,
    maxCostUsd: env.AI_WRITE_PER_RUN_BUDGET_USD,
    maxRetries: env.AI_PROVIDER_MAX_RETRIES,
  });
}

export async function generateWorkflowDrafts(input: EditorialWorkflowRequest) {
  const [opportunity, brand, research] = await Promise.all([
    getOpportunityForWorkflow(input.opportunityId),
    getBrandConfigurationForWorkflow(input.brandId),
    getResearchEvidenceForWorkflow(input.opportunityId),
  ]);
  if (!opportunity || opportunity.brandId !== input.brandId) {
    throw new EditorialWorkflowError(
      "opportunity_not_found",
      "The editorial opportunity was not found for this brand.",
      404,
    );
  }
  if (!brand || brand.brand.id !== input.brandId) {
    throw new EditorialWorkflowError(
      "brand_not_found",
      "The workflow brand configuration could not be loaded.",
      404,
    );
  }
  await assertWorkflowEditor({
    actorId: input.actorId,
    brandId: input.brandId,
    organizationId: brand.brand.organizationId,
  });
  if (!research?.evidencePackage.readyForWriting) {
    throw new EditorialWorkflowError(
      "evidence_not_ready",
      "Writing-ready research is required before editorial generation.",
      409,
    );
  }
  const similarity = await getSimilarityContext(input.brandId);
  const provider = createEditorialProvider();
  const supabase = createSupabaseServiceClient();
  const drafts = [];

  let generatedDrafts;
  try {
    const outputs = await generateEditorialDraftBatch(
      provider,
      input.contentStyles.map((contentStyle) => ({
        opportunityId: input.opportunityId,
        sourceTitle: opportunity.title,
        valueNucleus: opportunity.valueNucleus,
        contentStyle,
        tone: input.tone,
        brandContext: brand.context,
        evidencePackage: research.evidencePackage,
        sourceText: opportunity.cleanText,
        ...similarity,
      })),
    );
    generatedDrafts = outputs.map((output, index) => ({
      contentStyle: input.contentStyles[index]!,
      output,
    }));
  } catch (error) {
    if (error instanceof EditorialProviderError) {
      throw new EditorialWorkflowError(
        error.code,
        error.message,
        error.code === "budget_exceeded" ? 422 : error.retryable ? 503 : 502,
      );
    }
    throw error;
  }

  for (const { contentStyle, output } of generatedDrafts) {
    const styleIdempotencyKey = sha256Hex(`${input.idempotencyKey}:${contentStyle}`);
    const requestHash = sha256Hex(
      JSON.stringify({
        correlationId: input.correlationId,
        opportunityId: input.opportunityId,
        brandId: input.brandId,
        contentStyle,
        tone: input.tone,
        promptVersion: output.promptVersion,
      }),
    );
    const { data, error } = await supabase
      .rpc("create_evaluated_draft", {
        payload: {
          actorId: input.actorId,
          opportunityId: input.opportunityId,
          idempotencyKey: styleIdempotencyKey,
          requestHash,
          contentStyle: output.contentStyle,
          tone: output.tone,
          content: output.content,
          angles: output.angles,
          selectedAngleKey: output.selectedAngleKey,
          evaluation: output.evaluation,
          revisionCount: output.revisionCount,
          model: output.model,
          promptVersion: output.promptVersion,
          modelRecord: {
            provider: serverEnvSchema.parse(process.env).AI_PROVIDER,
            model: output.model,
            promptVersion: output.promptVersion,
            responseId: output.responseId,
            usage: output.usage,
            costUsd: output.usage.estimatedCostUsd,
            correlationId: input.correlationId,
          },
        },
      })
      .single();
    if (error) {
      throw new EditorialWorkflowError(
        error.code === "23505" ? "idempotency_conflict" : "draft_persistence_failed",
        error.code === "23505"
          ? "The editorial workflow idempotency key was reused."
          : "The generated draft could not be persisted.",
        error.code === "23505" ? 409 : 500,
      );
    }
    const row = draftRpcRowSchema.parse(data);
    drafts.push(
      draftGenerationResultSchema.parse({
        contractVersion: "1.0",
        postDraftId: row.post_draft_id,
        postVersionId: row.post_version_id,
        generationRunId: row.generation_run_id,
        status: "ready_for_review",
        duplicate: row.duplicate,
      }),
    );
  }
  return editorialWorkflowResultSchema.parse({
    contractVersion: "1.0",
    opportunityId: input.opportunityId,
    drafts,
  });
}

async function loadWorkflowPost(postDraftId: string) {
  const supabase = createSupabaseServiceClient();
  const { data: draft, error: draftError } = await supabase
    .from("post_drafts")
    .select("id,brand_id,opportunity_id,current_version_id,status")
    .eq("id", postDraftId)
    .maybeSingle();
  if (draftError) throw draftError;
  if (!draft?.current_version_id) {
    throw new EditorialWorkflowError("post_not_found", "The post draft was not found.", 404);
  }
  const { data: version, error: versionError } = await supabase
    .from("post_versions")
    .select("id,hook,body,closing,full_text")
    .eq("id", draft.current_version_id)
    .maybeSingle();
  if (versionError) throw versionError;
  if (!version) {
    throw new EditorialWorkflowError(
      "post_version_not_found",
      "The current post version was not found.",
      409,
    );
  }
  const [opportunity, brand, research] = await Promise.all([
    getOpportunityForWorkflow(draft.opportunity_id),
    getBrandConfigurationForWorkflow(draft.brand_id),
    getResearchEvidenceForWorkflow(draft.opportunity_id),
  ]);
  if (!opportunity || !brand || !research) {
    throw new EditorialWorkflowError(
      "evaluation_context_missing",
      "Evidence, opportunity, and brand context are required.",
      409,
    );
  }
  return {
    draft,
    version: {
      id: version.id,
      content: postContentSchema.parse({
        hook: version.hook,
        body: version.body,
        closing: version.closing ?? "",
        fullText: version.full_text,
      }),
    },
    opportunity,
    brand,
    research,
  };
}

export async function verifyWorkflowPost(input: PostVerificationWorkflowRequest) {
  const context = await loadWorkflowPost(input.postDraftId);
  if (context.draft.brand_id !== input.brandId) {
    throw new EditorialWorkflowError("post_not_found", "The post is not in this brand.", 404);
  }
  await assertWorkflowEditor({
    actorId: input.actorId,
    brandId: input.brandId,
    organizationId: context.brand.brand.organizationId,
  });
  const similarity = await getSimilarityContext(input.brandId, input.postDraftId);
  const evaluation = evaluateEditorialDraft({
    content: context.version.content,
    brandContext: context.brand.context,
    evidence: context.research.evidencePackage,
    sourceText: context.opportunity.cleanText,
    ...similarity,
  });
  const requestHash = sha256Hex(
    JSON.stringify({
      postDraftId: input.postDraftId,
      postVersionId: context.version.id,
      evaluation,
    }),
  );
  const { data, error } = await createSupabaseServiceClient()
    .rpc("verify_evaluated_post", {
      payload: {
        actorId: input.actorId,
        brandId: input.brandId,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        postDraftId: input.postDraftId,
        expectedVersionId: context.version.id,
        evaluation,
      },
    })
    .single();
  if (error) {
    throw new EditorialWorkflowError(
      error.code === "23505" ? "idempotency_conflict" : "verification_persistence_failed",
      error.code === "23505"
        ? "The verification idempotency key was reused."
        : "The verification result could not be persisted.",
      error.code === "23505" ? 409 : 500,
    );
  }
  const row = verificationRpcRowSchema.parse(data);
  return postVerificationWorkflowResultSchema.parse({
    contractVersion: "1.0",
    postDraftId: row.post_draft_id,
    postVersionId: row.post_version_id,
    evaluation,
    duplicate: row.duplicate,
  });
}

export async function regenerateWorkflowPost(input: PostActionWorkflowRequest) {
  const context = await loadWorkflowPost(input.postDraftId);
  if (context.draft.brand_id !== input.brandId) {
    throw new EditorialWorkflowError("post_not_found", "The post is not in this brand.", 404);
  }
  if (context.version.id !== input.expectedVersionId) {
    throw new EditorialWorkflowError(
      "stale_version",
      "The post changed before the content action ran.",
      409,
    );
  }
  if (["approved", "rejected"].includes(context.draft.status)) {
    throw new EditorialWorkflowError(
      "terminal_post",
      "Approved or rejected posts cannot be regenerated.",
      409,
    );
  }
  await assertWorkflowEditor({
    actorId: input.actorId,
    brandId: input.brandId,
    organizationId: context.brand.brand.organizationId,
  });
  const verifiedClaim = context.research.evidencePackage.claims.find(
    (claim) =>
      claim.importance === "core" &&
      claim.verificationState === "verified" &&
      claim.usageGuidance !== "do_not_use",
  );
  const content = selectivelyRegeneratePost({
    content: context.version.content,
    request: {
      component: input.component,
      instruction: input.instruction,
    },
    valueNucleus: context.opportunity.valueNucleus,
    verifiedClaim: verifiedClaim?.text,
  });
  const evaluation = evaluateEditorialDraft({
    content,
    brandContext: context.brand.context,
    evidence: context.research.evidencePackage,
    sourceText: context.opportunity.cleanText,
    ...(await getSimilarityContext(input.brandId, input.postDraftId)),
  });
  const requestHash = sha256Hex(
    JSON.stringify({
      postDraftId: input.postDraftId,
      expectedVersionId: input.expectedVersionId,
      component: input.component,
      instruction: input.instruction,
      content,
      evaluation,
    }),
  );
  const { data, error } = await createSupabaseServiceClient()
    .rpc("regenerate_post_component", {
      payload: {
        actorId: input.actorId,
        postDraftId: input.postDraftId,
        idempotencyKey: input.idempotencyKey,
        expectedVersionId: input.expectedVersionId,
        component: input.component,
        instruction: input.instruction,
        requestHash,
        content,
        evaluation,
      },
    })
    .single();
  if (error) {
    throw new EditorialWorkflowError(
      ["23505", "40001"].includes(error.code ?? "")
        ? "regeneration_conflict"
        : "regeneration_persistence_failed",
      ["23505", "40001"].includes(error.code ?? "")
        ? "The post changed or this regeneration key was reused."
        : "The regenerated version could not be persisted.",
      ["23505", "40001"].includes(error.code ?? "") ? 409 : 500,
    );
  }
  const row = regenerationRpcRowSchema.parse(data);
  return postRegenerationResultSchema.parse({
    contractVersion: "1.0",
    postDraftId: row.post_draft_id,
    postVersionId: row.post_version_id,
    versionNumber: row.version_number,
    status: "ready_for_review",
    duplicate: row.duplicate,
  });
}
