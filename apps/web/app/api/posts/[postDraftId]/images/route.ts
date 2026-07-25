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
    const message = error instanceof Error ? error.message : "The image action failed.";
    const stale = /changed|stale/i.test(message);
    return failure(
      stale ? 409 : 500,
      stale ? "stale_post_version" : "image_action_failed",
      stale ? "The post changed. Reload before changing its image." : "The image action failed.",
    );
  }
}
