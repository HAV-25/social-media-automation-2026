"use server";

import { evaluateEditorialDraft } from "@content-engine/ai";
import {
  postReviewActionSchema,
  postReviewResultSchema,
  type PostReviewAction,
} from "@content-engine/contracts";
import { sha256Hex } from "@content-engine/security";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getBrandConfiguration } from "@/lib/brand-configuration";
import {
  parseDemoDraftRecords,
  serializeDemoDraftRecords,
  uuidFromDeterministicHash,
} from "@/lib/demo-content-store";
import { canManageBrand, canReviewContent } from "@/lib/permissions";
import { getOpportunityDetail } from "@/lib/opportunity-detail";
import { getPostDetail } from "@/lib/post-detail";
import { assertCurrentVersion, nextPostStatus } from "@/lib/post-state";
import { getResearchEvidence } from "@/lib/research";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

function fail(postDraftId: string, message: string): never {
  redirect(`/posts/${postDraftId}?error=${encodeURIComponent(message)}`);
}

const reviewRpcRowSchema = z.object({
  post_draft_id: z.uuid(),
  post_version_id: z.uuid(),
  status: z.enum(["ready_for_review", "changes_requested", "approved", "rejected"]),
  duplicate: z.boolean(),
});

export async function reviewPost(
  postDraftId: string,
  action: PostReviewAction["action"],
  formData: FormData,
) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (action === "edit" ? !canManageBrand(user.role) : !canReviewContent(user.role)) {
    fail(postDraftId, "Your role cannot perform this review action.");
  }
  const post = await getPostDetail(postDraftId);
  if (!post) fail(postDraftId, "Post draft not found or not assigned.");

  const expectedVersionId = String(formData.get("expectedVersionId") ?? "");
  try {
    assertCurrentVersion(post.currentVersion.id, expectedVersionId);
  } catch {
    fail(postDraftId, "This post changed in another session. Reload before saving.");
  }
  const nextStatus = nextPostStatus(post.status, action);
  if (!nextStatus) fail(postDraftId, `Action ${action} is not allowed from ${post.status}.`);

  const closing = String(formData.get("closing") ?? "").trim();
  const hook = String(formData.get("hook") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const warningsAcknowledged = formData.get("warningsAcknowledged") === "on";
  if (action === "approve" && !post.evaluation) {
    fail(postDraftId, "Verification data is unavailable. Retry verification before approval.");
  }
  const hasReadinessWarnings = action === "approve" && !post.evaluation?.readyForReview;
  if (hasReadinessWarnings && !warningsAcknowledged) {
    fail(postDraftId, "Acknowledge the recorded warnings before approving this post.");
  }
  if (hasReadinessWarnings && reason.length < 10) {
    fail(postDraftId, "Add a short decision reason before approving with warnings.");
  }
  const input = postReviewActionSchema.safeParse(
    action === "edit"
      ? {
          action,
          idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
          expectedVersionId,
          content: {
            hook,
            body,
            closing,
            fullText: [hook, body, closing].filter(Boolean).join("\n\n"),
          },
        }
      : {
          action,
          idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
          expectedVersionId,
          reason,
          ...(action === "approve" ? { warningsAcknowledged } : {}),
        },
  );
  if (!input.success) {
    fail(postDraftId, input.error.issues[0]?.message ?? "Review action failed validation.");
  }
  const validated = input.data;
  const editedContent = validated.action === "edit" ? validated.content : undefined;
  const decisionReason = validated.action === "edit" ? "" : validated.reason;
  let nextEvaluation = post.evaluation;
  if (editedContent) {
    const [opportunity, research, brandConfiguration] = await Promise.all([
      getOpportunityDetail(post.opportunityId),
      getResearchEvidence(post.opportunityId),
      getBrandConfiguration(post.brandId),
    ]);
    if (!opportunity || !research || !brandConfiguration) {
      fail(postDraftId, "Evidence and brand context are required to evaluate this edit.");
    }
    nextEvaluation = evaluateEditorialDraft({
      content: editedContent,
      brandContext: brandConfiguration.context,
      evidence: research.evidencePackage,
      sourceText: opportunity.cleanText,
    });
  }

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const cookieStore = await cookies();
    const drafts = parseDemoDraftRecords(cookieStore.get("demo-draft-records")?.value);
    const draft = drafts.find((item) => item.postDraftId === postDraftId);
    if (!draft) fail(postDraftId, "Demo draft is no longer available.");
    const versionId =
      action === "edit"
        ? uuidFromDeterministicHash(
            sha256Hex(`${postDraftId}:${input.data.idempotencyKey}:manual-edit`),
          )
        : draft.postVersionId;
    const updated = {
      ...draft,
      postVersionId: versionId,
      versionNumber: action === "edit" ? draft.versionNumber + 1 : draft.versionNumber,
      status: nextStatus,
      content: editedContent ?? draft.content,
      versions:
        action === "edit"
          ? [
              ...draft.versions,
              {
                id: versionId,
                versionNumber: draft.versionNumber + 1,
                content: editedContent!,
                generationType: "manual_edit" as const,
                createdAt: new Date().toISOString(),
              },
            ].slice(-10)
          : draft.versions,
      evaluation: nextEvaluation ?? draft.evaluation,
      feedback: [
        {
          eventType: action,
          reason: decisionReason,
          createdAt: new Date().toISOString(),
        },
        ...draft.feedback,
      ].slice(0, 10),
    };
    cookieStore.set(
      "demo-draft-records",
      serializeDemoDraftRecords([updated, ...drafts.filter((item) => item !== draft)]),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 8,
      },
    );
    redirect(`/posts/${postDraftId}?saved=${action}`);
  }

  // Approve/reject go through the lightweight pipeline RPC, called as the signed-in
  // user (review_lightweight_post checks auth.uid()/can_edit_brand). The approval
  // gate above (evaluation present, warnings acknowledged, reason) is preserved.
  // Edit and request_changes stay on the existing evaluated-post path below.
  if (validated.action === "approve" || validated.action === "reject") {
    const authedClient = await createSupabaseServerClient();
    const { error: reviewError } = await authedClient.rpc("review_lightweight_post", {
      payload: {
        postDraftId,
        decision: validated.action,
        reason: decisionReason,
        expectedVersionId,
        idempotencyKey: validated.idempotencyKey,
      },
    });
    if (reviewError) {
      if (reviewError.code === "40001") {
        fail(postDraftId, "This post changed in another session. Reload before saving.");
      }
      if (reviewError.code === "23505") {
        fail(postDraftId, "This review key was reused for a different action.");
      }
      fail(postDraftId, "The review action could not be persisted.");
    }
    redirect(`/posts/${postDraftId}?saved=${action}`);
  }

  const requestHash = sha256Hex(
    JSON.stringify({
      postDraftId,
      action,
      expectedVersionId,
      content: editedContent,
      evaluation: nextEvaluation ?? undefined,
      reason: decisionReason || undefined,
    }),
  );
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .rpc("review_evaluated_post", {
      payload: {
        ...validated,
        actorId: user.id,
        postDraftId,
        requestHash,
        evaluation: nextEvaluation,
        warningSnapshot: undefined,
      },
    })
    .single();
  if (error) {
    if (error.code === "40001") {
      fail(postDraftId, "This post changed in another session. Reload before saving.");
    }
    if (error.code === "23505") {
      fail(postDraftId, "This review key was reused for a different action.");
    }
    fail(postDraftId, "The review action could not be persisted.");
  }
  postReviewResultSchema.parse({
    contractVersion: "1.0",
    postDraftId: reviewRpcRowSchema.parse(data).post_draft_id,
    postVersionId: reviewRpcRowSchema.parse(data).post_version_id,
    status: reviewRpcRowSchema.parse(data).status,
    duplicate: reviewRpcRowSchema.parse(data).duplicate,
  });
  redirect(`/posts/${postDraftId}?saved=${action}`);
}
