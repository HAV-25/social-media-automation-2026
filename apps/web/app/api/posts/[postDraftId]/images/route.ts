import { imageReviewActionRequestSchema } from "@content-engine/contracts";
import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceUserApiRateLimit } from "@/lib/api-rate-limit";
import { canManageBrand, canReviewContent } from "@/lib/permissions";
import { getPostDetail } from "@/lib/post-detail";
import { getPostImageReviewState, performPostImageAction } from "@/lib/post-image-review";
import { isSameOriginRequest } from "@/lib/request-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function typedImageFailure(error: unknown) {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    !("message" in error) ||
    !("status" in error)
  ) {
    return null;
  }
  const candidate = error as { code?: unknown; message?: unknown; status?: unknown };
  return typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.status === "number" &&
    candidate.status >= 400 &&
    candidate.status <= 599
    ? { code: candidate.code, message: candidate.message, status: candidate.status }
    : null;
}

// Poll target: the image client calls this after enqueuing a generation so it
// can tell when the worker's new image has landed.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ postDraftId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !canReviewContent(user.role)) {
    return failure(401, "authentication_required", "Sign in to view image status.");
  }
  const { postDraftId } = await context.params;
  const post = await getPostDetail(postDraftId);
  if (!post) return failure(404, "post_not_found", "Post not found or not assigned.");
  const state = await getPostImageReviewState(post);
  return NextResponse.json({
    contractVersion: "1.0",
    status: state.status,
    imageAssetId: state.imageAssetId,
    postVersionId: state.postVersionId,
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ postDraftId: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return failure(403, "origin_rejected", "Cross-origin image actions are not allowed.");
  }
  const user = await getCurrentUser();
  if (!user) return failure(401, "authentication_required", "Sign in to manage post images.");
  const rateLimited = await enforceUserApiRateLimit({ request, userId: user.id });
  if (rateLimited) return rateLimited;
  if (!canManageBrand(user.role)) {
    return failure(403, "editor_role_required", "Your role cannot regenerate post images.");
  }
  const parsed = imageReviewActionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return failure(
      422,
      "invalid_image_action",
      parsed.error.issues[0]?.message ?? "The image action is invalid.",
    );
  }
  const { postDraftId } = await context.params;
  const post = await getPostDetail(postDraftId);
  if (!post || post.brandId === "" || user.organizationId === "") {
    return failure(404, "post_not_found", "Post not found or not assigned.");
  }
  if (["approved", "rejected"].includes(post.status)) {
    return failure(409, "post_is_terminal", "Images cannot change after a final post decision.");
  }

  // Demo mode keeps the deterministic in-process compositor (no model call).
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    try {
      const result = await performPostImageAction({
        actorId: user.id,
        organizationId: user.organizationId,
        post,
        request: parsed.data,
      });
      return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
    } catch (error) {
      const typed = typedImageFailure(error);
      if (typed) return failure(typed.status, typed.code, typed.message);
      const message = error instanceof Error ? error.message : "The image action failed.";
      const stale = /changed|stale/i.test(message);
      return failure(
        stale ? 409 : 500,
        stale ? "stale_post_version" : "image_action_failed",
        stale ? "The post changed. Reload before changing its image." : "The image action failed.",
      );
    }
  }

  // Real mode: enqueue the branded image on the lightweight worker (as the
  // signed-in editor) instead of calling the image model inline. The worker is
  // not bound by the serverless timeout, and uses the pipeline's proven image
  // stage. The client polls GET above until the new image is ready.
  const authed = await createSupabaseServerClient();
  const { data, error } = await authed
    .rpc("request_lightweight_action", {
      payload: {
        brandId: post.brandId,
        opportunityId: post.opportunityId,
        postDraftId,
        expectedVersionId: post.currentVersion.id,
        action: "image",
        idempotencyKey: parsed.data.idempotencyKey,
      },
    })
    .single();
  if (error) {
    if (error.code === "40001") {
      return failure(
        409,
        "stale_post_version",
        "The post changed. Reload before changing its image.",
      );
    }
    if (error.code === "42501") {
      return failure(403, "editor_role_required", "Your role cannot regenerate post images.");
    }
    return failure(500, "image_enqueue_failed", "The image request could not be queued.");
  }
  const instance = data as { id?: string } | null;
  return NextResponse.json(
    { contractVersion: "1.0", status: "queued", pipelineInstanceId: instance?.id ?? null },
    { status: 202 },
  );
}
