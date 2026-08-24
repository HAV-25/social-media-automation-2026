import { evaluateEditorialDraft, selectivelyRegeneratePost } from "@content-engine/ai";
import {
  postRegenerationRequestSchema,
  postRegenerationResultSchema,
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
} from "@/lib/demo-content-store";
import { getOpportunityDetail } from "@/lib/opportunity-detail";
import { canManageBrand } from "@/lib/permissions";
import { getPostDetail } from "@/lib/post-detail";
import { isSameOriginRequest } from "@/lib/request-origin";
import { getResearchEvidence } from "@/lib/research";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postDraftId: string }> },
) {
  if (!isSameOriginRequest(request)) {
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
  if (!["ready_for_review", "changes_requested"].includes(post.status)) {
    return errorResponse(
      409,
      "not_reviewable",
      "This post is not in a state that can be regenerated.",
    );
  }
  const opportunity = await getOpportunityDetail(post.opportunityId);
  if (!opportunity) {
    return errorResponse(409, "evaluation_context_missing", "The opportunity context is required.");
  }

  try {
    // Deterministic component rewrite (no model call).
    const content = selectivelyRegeneratePost({
      content: post.currentVersion.content,
      request: input.data,
      valueNucleus: opportunity.valueNucleus,
    });

    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
      const [research, brandConfiguration] = await Promise.all([
        getResearchEvidence(post.opportunityId),
        getBrandConfiguration(post.brandId),
      ]);
      if (!research || !brandConfiguration) {
        return errorResponse(
          409,
          "evaluation_context_missing",
          "Evidence and brand context are required for selective regeneration.",
        );
      }
      const evaluation = evaluateEditorialDraft({
        content,
        brandContext: brandConfiguration.context,
        evidence: research.evidencePackage,
        sourceText: opportunity.cleanText,
      });
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

    // Real mode: persist the rewritten component as a new immutable version via
    // the lightweight edit RPC (as the signed-in editor). It creates the version
    // and enqueues an async re-verify, replacing the old regenerate_post_component
    // path whose claim-provenance gate rejects lightweight-generated posts.
    const authed = await createSupabaseServerClient();
    const { data, error } = await authed.rpc("save_lightweight_post_edit", {
      payload: {
        postDraftId,
        expectedVersionId: input.data.expectedVersionId,
        hook: content.hook,
        body: content.body,
        closing: content.closing,
        idempotencyKey: input.data.idempotencyKey,
      },
    });
    if (error) {
      if (error.code === "40001") {
        return errorResponse(409, "stale_version", "The post changed. Reload before regenerating.");
      }
      if (error.code === "23505") {
        return errorResponse(409, "regeneration_conflict", "This regeneration key was reused.");
      }
      if (error.code === "42501") {
        return errorResponse(
          403,
          "editor_role_required",
          "Your role cannot regenerate post content.",
        );
      }
      if (error.code === "22023") {
        return errorResponse(
          422,
          "invalid_regeneration_request",
          "The regenerated content is out of bounds.",
        );
      }
      return errorResponse(
        500,
        "regeneration_persistence_failed",
        "The regenerated version could not be persisted.",
      );
    }
    const postVersionId = typeof data === "string" ? data : String(data);
    return NextResponse.json(
      postRegenerationResultSchema.parse({
        contractVersion: "1.0",
        postDraftId,
        postVersionId,
        versionNumber: post.currentVersion.versionNumber + 1,
        status: "verifying",
        duplicate: false,
      }),
      { status: 201 },
    );
  } catch {
    return errorResponse(
      500,
      "regeneration_failed",
      "The regeneration could not be completed. Please try again.",
    );
  }
}
