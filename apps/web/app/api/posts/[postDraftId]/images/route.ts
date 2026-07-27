import { imageReviewActionRequestSchema } from "@content-engine/contracts";
import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceUserApiRateLimit } from "@/lib/api-rate-limit";
import { canManageBrand } from "@/lib/permissions";
import { getPostDetail } from "@/lib/post-detail";
import { performPostImageAction } from "@/lib/post-image-review";
import { isSameOriginRequest } from "@/lib/request-origin";

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
