import {
  EditorialProviderError,
  FakeEditorialProvider,
  OpenAIEditorialProvider,
} from "@content-engine/ai";
import {
  draftGenerationQueuedResultSchema,
  draftGenerationRequestSchema,
  draftGenerationResultSchema,
  draftGenerationStatusSchema,
  serverEnvSchema,
} from "@content-engine/contracts";
import { sha256Hex } from "@content-engine/security";
import { type NextRequest, NextResponse } from "next/server";
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
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

  // Real mode: enqueue the draft on the lightweight worker (as the signed-in
  // editor) instead of calling the writing model inline. The worker is not bound
  // by the serverless timeout; it performs the model call and persists the draft
  // via the pipeline, and the client polls the GET below and navigates once the
  // draft exists. NOTE: the worker derives content_style from the opportunity and
  // uses its house tone, so the reviewer's style/tone selection is advisory in
  // real mode (it is honored in demo).
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") {
    const authed = await createSupabaseServerClient();
    const { data, error } = await authed
      .rpc("request_lightweight_action", {
        payload: {
          brandId: opportunity.brandId,
          opportunityId,
          action: "draft",
          idempotencyKey: parsed.data.idempotencyKey,
        },
      })
      .single();
    if (error) {
      if (error.code === "42501") {
        return errorResponse(403, "editor_role_required", "Your role cannot generate drafts.");
      }
      if (error.code === "23505") {
        return errorResponse(
          409,
          "idempotency_conflict",
          "This idempotency key was already used for a different request.",
        );
      }
      if (error.code === "22023") {
        return errorResponse(422, "invalid_generation_request", "The draft request is invalid.");
      }
      return errorResponse(500, "draft_enqueue_failed", "The draft request could not be queued.");
    }
    const instance = data as { id?: string } | null;
    return NextResponse.json(
      draftGenerationQueuedResultSchema.parse({
        contractVersion: "1.0",
        status: "queued",
        pipelineInstanceId: instance?.id ?? null,
      }),
      { status: 202 },
    );
  }

  const existingDrafts =
    process.env.NEXT_PUBLIC_DEMO_MODE !== "false"
      ? parseDemoDraftRecords(request.cookies.get("demo-draft-records")?.value)
      : [];
  // Demo-only from here down (real mode enqueued and returned above). Similarity
  // context is derived from the demo cookie records.
  const recentSameBrandPosts = existingDrafts
    .filter((draft) => draft.brandId === opportunity.brandId)
    .map((draft) => draft.content.fullText);
  const crossBrandPosts = existingDrafts
    .filter((draft) => draft.brandId !== opportunity.brandId)
    .map((draft) => draft.content.fullText);
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

  // Unreachable: real mode enqueued and returned above; demo mode returned inside
  // the block. Present only so the function is total for the type checker.
  return errorResponse(500, "draft_generation_failed", "The draft could not be generated.");
}

// Poll target: after enqueuing a draft the client polls here until the worker's
// post draft for this opportunity exists, then navigates to it.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !canManageBrand(user.role)) {
    return errorResponse(401, "authentication_required", "Sign in to view draft status.");
  }
  const { opportunityId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("post_drafts")
    .select("id")
    .eq("opportunity_id", opportunityId)
    .not("current_version_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return errorResponse(500, "draft_status_failed", "Draft status could not be loaded.");
  }
  const postDraftId = data?.id ?? null;
  return NextResponse.json(
    draftGenerationStatusSchema.parse({
      contractVersion: "1.0",
      status: postDraftId ? "ready" : "pending",
      postDraftId,
    }),
  );
}
