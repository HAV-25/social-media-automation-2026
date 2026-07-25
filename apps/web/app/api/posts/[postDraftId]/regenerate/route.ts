import { evaluateEditorialDraft, selectivelyRegeneratePost } from "@content-engine/ai";
import {
  postRegenerationRequestSchema,
  postRegenerationResultSchema,
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
} from "@/lib/demo-content-store";
import { getOpportunityDetail } from "@/lib/opportunity-detail";
import { canManageBrand } from "@/lib/permissions";
import { getPostDetail } from "@/lib/post-detail";
import { getResearchEvidence } from "@/lib/research";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const rpcRowSchema = z.object({
  post_draft_id: z.uuid(),
  post_version_id: z.uuid(),
  version_number: z.number().int().positive(),
  duplicate: z.boolean(),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postDraftId: string }> },
) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return errorResponse(403, "origin_rejected", "Cross-origin regeneration is not allowed.");
  }
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "authentication_required", "Sign in to regenerate a post.");
  const rateLimited = await enforceUserApiRateLimit({ request, userId: user.id });
  if (rateLimited) return rateLimited;
  if (!canManageBrand(user.role)) {
    return errorResponse(403, "editor_role_required", "Your role cannot regenerate post content.");
  }
  const input = postRegenerationRequestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return errorResponse(
      422,
      "invalid_regeneration_request",
      input.error.issues[0]?.message ?? "Regeneration request failed validation.",
    );
  }
  const { postDraftId } = await params;
  const post = await getPostDetail(postDraftId);
  if (!post) return errorResponse(404, "post_not_found", "Post not found or not assigned.");
  if (post.currentVersion.id !== input.data.expectedVersionId) {
    return errorResponse(409, "stale_version", "The post changed. Reload before regenerating.");
  }
  if (["approved", "rejected"].includes(post.status)) {
    return errorResponse(409, "terminal_post", "Approved or rejected posts cannot be regenerated.");
  }
  const [opportunity, research, brandConfiguration] = await Promise.all([
    getOpportunityDetail(post.opportunityId),
    getResearchEvidence(post.opportunityId),
    getBrandConfiguration(post.brandId),
  ]);
  if (!opportunity || !research || !brandConfiguration) {
    return errorResponse(
      409,
      "evaluation_context_missing",
      "Evidence and brand context are required for selective regeneration.",
    );
  }
  const content = selectivelyRegeneratePost({
    content: post.currentVersion.content,
    request: input.data,
    valueNucleus: opportunity.valueNucleus,
  });
  const evaluation = evaluateEditorialDraft({
    content,
    brandContext: brandConfiguration.context,
    evidence: research.evidencePackage,
    sourceText: opportunity.cleanText,
  });
  const requestHash = sha256Hex(
    JSON.stringify({
      postDraftId,
      expectedVersionId: input.data.expectedVersionId,
      component: input.data.component,
      instruction: input.data.instruction,
      content,
      evaluation,
    }),
  );

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const drafts = parseDemoDraftRecords(request.cookies.get("demo-draft-records")?.value);
    const draft = drafts.find((candidate) => candidate.postDraftId === postDraftId);
    if (!draft) return errorResponse(404, "post_not_found", "Demo post is no longer available.");
    const versionNumber = draft.versionNumber + 1;
    const postVersionId = uuidFromDeterministicHash(
      sha256Hex(`${postDraftId}:${input.data.idempotencyKey}:regeneration`),
    );
    const updated = {
      ...draft,
      postVersionId,
      versionNumber,
      status: "ready_for_review" as const,
      content,
      versions: [
        ...draft.versions,
        {
          id: postVersionId,
          versionNumber,
          content,
          generationType: "selective_regeneration" as const,
          createdAt: new Date().toISOString(),
        },
      ].slice(-10),
      evaluation,
      feedback: [
        {
          eventType: "selective_regeneration",
          reason: `${input.data.component}: ${input.data.instruction}`,
          createdAt: new Date().toISOString(),
        },
        ...draft.feedback,
      ].slice(0, 10),
    };
    const response = NextResponse.json(
      postRegenerationResultSchema.parse({
        contractVersion: "1.0",
        postDraftId,
        postVersionId,
        versionNumber,
        status: "ready_for_review",
        duplicate: false,
      }),
      { status: 201 },
    );
    response.cookies.set(
      "demo-draft-records",
      serializeDemoDraftRecords([updated, ...drafts.filter((candidate) => candidate !== draft)]),
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

  const { data, error } = await createSupabaseServiceClient()
    .rpc("regenerate_post_component", {
      payload: {
        actorId: user.id,
        postDraftId,
        ...input.data,
        requestHash,
        content,
        evaluation,
      },
    })
    .single();
  if (error) {
    const conflict = ["23505", "40001"].includes(error.code ?? "");
    return errorResponse(
      conflict ? 409 : 500,
      conflict ? "regeneration_conflict" : "regeneration_persistence_failed",
      conflict
        ? "The post changed or this regeneration key was reused."
        : "The regenerated version could not be persisted.",
    );
  }
  const row = rpcRowSchema.parse(data);
  return NextResponse.json(
    postRegenerationResultSchema.parse({
      contractVersion: "1.0",
      postDraftId: row.post_draft_id,
      postVersionId: row.post_version_id,
      versionNumber: row.version_number,
      status: "ready_for_review",
      duplicate: row.duplicate,
    }),
    { status: row.duplicate ? 200 : 201 },
  );
}
