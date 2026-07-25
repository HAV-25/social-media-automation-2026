import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceUserApiRateLimit } from "@/lib/api-rate-limit";
import { buildReviewerPackage } from "@/lib/download-package";
import { canReviewContent } from "@/lib/permissions";
import { getPostDetail } from "@/lib/post-detail";
import { getPostFinalImageBytes } from "@/lib/post-image-review";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ postDraftId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canReviewContent(user.role)) {
    return NextResponse.json(
      { error: { code: "authentication_required", message: "Sign in to download this package." } },
      { status: 401 },
    );
  }
  const rateLimited = await enforceUserApiRateLimit({ request, userId: user.id });
  if (rateLimited) return rateLimited;
  const { postDraftId } = await context.params;
  const post = await getPostDetail(postDraftId);
  if (!post) {
    return NextResponse.json(
      { error: { code: "post_not_found", message: "Post not found or not assigned." } },
      { status: 404 },
    );
  }
  const image = await getPostFinalImageBytes(post);
  if (!image) {
    return NextResponse.json(
      {
        error: {
          code: "image_not_ready",
          message: "Generate a ready image before downloading the package.",
        },
      },
      { status: 409 },
    );
  }
  const packageResult = buildReviewerPackage({
    post: {
      id: post.id,
      brandId: post.brandId,
      opportunityId: post.opportunityId,
      sourceTitle: post.sourceTitle,
      contentStyle: post.contentStyle,
      tone: post.tone,
      status: post.status,
      versionId: post.currentVersion.id,
      versionNumber: post.currentVersion.versionNumber,
      fullText: post.currentVersion.content.fullText,
      evaluation: post.evaluation,
    },
    image,
  });
  return new NextResponse(new Uint8Array(packageResult.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(packageResult.bytes.byteLength),
      "Content-Disposition": `attachment; filename="${packageResult.filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
