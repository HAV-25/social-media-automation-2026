import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceUserApiRateLimit } from "@/lib/api-rate-limit";
import { canReviewContent } from "@/lib/permissions";
import { getPostDetail } from "@/lib/post-detail";
import { getPostFinalImageBytes } from "@/lib/post-image-review";

export const runtime = "nodejs";

function filename(value: string) {
  const safe = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${safe || "facebook-post"}-image.png`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ postDraftId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !canReviewContent(user.role)) {
    return NextResponse.json(
      { error: { code: "authentication_required", message: "Sign in to view this image." } },
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
        error: { code: "image_not_ready", message: "No ready image exists for this post version." },
      },
      { status: 404 },
    );
  }
  const attachment = request.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(image.bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(image.bytes.byteLength),
      "Content-Disposition": `${attachment ? "attachment" : "inline"}; filename="${filename(
        post.sourceTitle,
      )}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
