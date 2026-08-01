import {
  EditorialProviderError,
  FakeEditorialProvider,
  OpenAIEditorialProvider,
  buildEditorialPromptSnapshot,
} from "@content-engine/ai";
import {
  draftGenerationRequestSchema,
  draftGenerationResultSchema,
  serverEnvSchema,
} from "@content-engine/contracts";
import { sha256Hex } from "@content-engine/security";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { enforceUserApiRateLimit } from "@/lib/api-rate-limit";
import { getBrandConfiguration } from "@/lib/brand-configuration";
import {
  parseDemoDraftRecords,
  serializeDemoDraftRecords,
  uuidFromDeterministicHash,
  type DemoDraftRecord,
} from "@/lib/demo-content-store";
import { getOpportunityDetail } from "@/lib/opportunity-detail";
import { canManageBrand } from "@/lib/permissions";
import { isSameOriginRequest } from "@/lib/request-origin";
import { getResearchEvidence } from "@/lib/research";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const draftRpcRowSchema = z.object({
  post_draft_id: z.uuid(),
  post_version_id: z.uuid(),
  generation_run_id: z.uuid(),
  duplicate: z.boolean(),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "origin_rejected", "Cross-origin generation is not allowed.");
  }
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "authentication_required", "Sign in to generate a draft.");
  const rateLimited = await enforceUserApiRateLimit({ request, userId: user.id });
  if (rateLimited) return rateLimited;
  if (!canManageBrand(user.role)) {
    return errorResponse(403, "editor_role_required", "Your role cannot generate drafts.");
  }
  const parsed = draftGenerationRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(
      422,
      "invalid_generation_request",
      parsed.error.issues[0]?.message ?? "Generation request failed validation.",
    );
  }

  const { opportunityId } = await params;
  const opportunity = await getOpportunityDetail(opportunityId);
  if (!opportunity) {
    return errorResponse(404, "opportunity_not_found", "Opportunity not found or not assigned.");
  }
  const brandConfiguration = await getBrandConfiguration(opportunity.brandId);
  if (!brandConfiguration) {
    return errorResponse(404, "brand_not_found", "Brand context could not be loaded.");
  }
  const research = await getResearchEvidence(opportunityId);
  if (!research) {
    return errorResponse(
      409,
      "evidence_not_ready",
      "Complete bounded research before generating a draft.",
    );
  }
  const existingDrafts =
    process.env.NEXT_PUBLIC_DEMO_MODE !== "false"
      ? parseDemoDraftRecords(request.cookies.get("demo-draft-records")?.value)
      : [];
  let recentSameBrandPosts = existingDrafts
    .filter((draft) => draft.brandId === opportunity.brandId)
    .map((draft) => draft.content.fullText);
  let crossBrandPosts = existingDrafts
    .filter((draft) => draft.brandId !== opportunity.brandId)
    .map((draft) => draft.content.fullText);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") {
    const supabase = createSupabaseServiceClient();
    const { data: recentDrafts, error: recentDraftError } = await supabase
      .from("post_drafts")
      .select("brand_id,current_version_id")
      .not("current_version_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (recentDraftError) {
      return errorResponse(
        500,
        "similarity_context_failed",
        "Recent post similarity context could not be loaded.",
      );
    }
    const versionIds = (recentDrafts ?? [])
      .map((draft) => draft.current_version_id)
      .filter((id): id is string => Boolean(id));
    const { data: recentVersions, error: recentVersionError } = versionIds.length
      ? await supabase.from("post_versions").select("id,full_text").in("id", versionIds)
      : { data: [], error: null };
    if (recentVersionError) {
      return errorResponse(
        500,
        "similarity_context_failed",
        "Recent post similarity context could not be loaded.",
      );
    }
    const textByVersion = new Map(
      (recentVersions ?? []).map((version) => [version.id, version.full_text]),
    );
    recentSameBrandPosts = (recentDrafts ?? [])
      .filter((draft) => draft.brand_id === opportunity.brandId)
      .map((draft) => textByVersion.get(draft.current_version_id ?? ""))
      .filter((text): text is string => Boolean(text));
    crossBrandPosts = (recentDrafts ?? [])
      .filter((draft) => draft.brand_id !== opportunity.brandId)
      .map((draft) => textByVersion.get(draft.current_version_id ?? ""))
      .filter((text): text is string => Boolean(text));
  }
  const env = serverEnvSchema.parse(process.env);
  if (env.AI_PROVIDER === "openai" && !env.AI_EDITORIAL_EVAL_BASELINE_ID) {
    return errorResponse(
      503,
      "editorial_baseline_required",
      "Production writing requires an accepted editorial evaluation baseline.",
    );
  }
  if (env.AI_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
    return errorResponse(
      503,
      "openai_key_required",
      "Production writing requires a server-side OpenAI API key.",
    );
  }
  const provider =
    process.env.NEXT_PUBLIC_DEMO_MODE !== "false" || env.AI_PROVIDER === "fake"
      ? new FakeEditorialProvider()
      : new OpenAIEditorialProvider({
          apiKey: env.OPENAI_API_KEY ?? "",
          model: env.AI_MODEL_WRITE,
          reasoningEffort: env.AI_WRITE_REASONING_EFFORT,
          inputUsdPer1M: env.AI_INPUT_USD_PER_1M,
          outputUsdPer1M: env.AI_OUTPUT_USD_PER_1M,
          maxOutputTokens: env.AI_WRITE_MAX_OUTPUT_TOKENS,
          timeoutMs: env.AI_WRITE_TIMEOUT_MS,
          maxCostUsd: env.AI_WRITE_PER_RUN_BUDGET_USD,
          maxRetries: env.AI_PROVIDER_MAX_RETRIES,
        });
  const generationRequest = {
    opportunityId,
    sourceTitle: opportunity.title,
    valueNucleus: opportunity.valueNucleus,
    contentStyle: parsed.data.contentStyle,
    tone: parsed.data.tone,
    brandContext: brandConfiguration.context,
    evidencePackage: research.evidencePackage,
    sourceText: opportunity.cleanText,
    recentSameBrandPosts,
    crossBrandPosts,
  };
  const promptSnapshot = buildEditorialPromptSnapshot(generationRequest);
  let output;
  try {
    output = await provider.generateDraft(generationRequest);
  } catch (error) {
    if (error instanceof EditorialProviderError) {
      return errorResponse(
        error.code === "budget_exceeded" ? 422 : error.retryable ? 503 : 502,
        error.code,
        error.message,
      );
    }
    return errorResponse(502, "editorial_provider_failed", "The writing provider failed.");
  }
  const requestHash = sha256Hex(
    JSON.stringify({
      opportunityId,
      brandId: opportunity.brandId,
      contentStyle: parsed.data.contentStyle,
      tone: parsed.data.tone,
      promptVersion: output.promptVersion,
      promptChecksum: promptSnapshot.checksum,
    }),
  );

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const drafts = existingDrafts;
    const existing = drafts.find(
      (draft) =>
        draft.opportunityId === opportunityId &&
        draft.contentStyle === parsed.data.contentStyle &&
        draft.tone === parsed.data.tone,
    );
    const draftIdentity = sha256Hex(
      `${opportunityId}:${parsed.data.contentStyle}:${parsed.data.tone}`,
    );
    const postDraftId = existing?.postDraftId ?? uuidFromDeterministicHash(draftIdentity);
    const postVersionId =
      existing?.postVersionId ?? uuidFromDeterministicHash(sha256Hex(`${draftIdentity}:version:1`));
    const generationRunId = uuidFromDeterministicHash(sha256Hex(parsed.data.idempotencyKey));
    const result = draftGenerationResultSchema.parse({
      contractVersion: "1.0",
      postDraftId,
      postVersionId,
      versionNumber: existing?.versionNumber ?? 1,
      generationRunId,
      status: "ready_for_review",
      duplicate: Boolean(existing),
    });
    const record: DemoDraftRecord = {
      postDraftId,
      postVersionId,
      versionNumber: existing?.versionNumber ?? 1,
      generationRunId,
      opportunityId,
      brandId: opportunity.brandId,
      contentStyle: parsed.data.contentStyle,
      tone: parsed.data.tone,
      status: "ready_for_review",
      angles: output.angles,
      selectedAngleKey: output.selectedAngleKey,
      content: output.content,
      versions: existing?.versions ?? [
        {
          id: postVersionId,
          versionNumber: 1,
          content: output.content,
          generationType: "initial",
          createdAt: new Date().toISOString(),
        },
      ],
      evaluation: output.evaluation,
      revisionCount: output.revisionCount,
      model: output.model,
      promptVersion: output.promptVersion,
      responseId: output.responseId,
      inputTokens: output.usage.inputTokens,
      outputTokens: output.usage.outputTokens,
      feedback: existing?.feedback ?? [],
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    const response = NextResponse.json(result, { status: existing ? 200 : 201 });
    response.cookies.set(
      "demo-draft-records",
      serializeDemoDraftRecords([record, ...drafts.filter((draft) => draft !== existing)]),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 8,
      },
    );
    return response;
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .rpc("create_evaluated_draft", {
      payload: {
        actorId: user.id,
        opportunityId,
        idempotencyKey: parsed.data.idempotencyKey,
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
          provider: env.AI_PROVIDER,
          model: output.model,
          promptVersion: output.promptVersion,
          promptSnapshot,
          responseId: output.responseId,
          usage: output.usage,
          costUsd: output.usage.estimatedCostUsd,
          evaluation: output.evaluation,
          selectedAngleKey: output.selectedAngleKey,
        },
      },
    })
    .single();
  if (error) {
    const conflict = error.code === "23505";
    return errorResponse(
      conflict ? 409 : 500,
      conflict ? "idempotency_conflict" : "draft_persistence_failed",
      conflict
        ? "This idempotency key was already used for a different request."
        : "The draft could not be persisted.",
    );
  }
  const row = draftRpcRowSchema.parse(data);
  const result = draftGenerationResultSchema.parse({
    contractVersion: "1.0",
    postDraftId: row.post_draft_id,
    postVersionId: row.post_version_id,
    generationRunId: row.generation_run_id,
    status: "ready_for_review",
    duplicate: row.duplicate,
  });
  return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
}
