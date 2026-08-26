export type ReviewablePostStatus =
  | "drafting"
  | "evaluating"
  | "verifying"
  | "image_pending"
  | "ready_for_review"
  | "changes_requested"
  | "approved"
  | "rejected";
export type PostAction = "edit" | "approve" | "reject";

// A review action can only ever land on one of these outcome statuses; the
// in-progress statuses (drafting/verifying/…) are valid *source* states but are
// never produced by a transition. `changes_requested` is no longer produced by
// any action (Request-changes was removed) but stays a valid *source* state so
// posts left in it by earlier versions remain editable/approvable/rejectable.
export type PostReviewOutcome = "ready_for_review" | "approved" | "rejected";

// Only ready_for_review / changes_requested accept review actions. In-progress
// and terminal states are no-ops here (kept in the map so nextPostStatus is
// total and never dereferences undefined).
const transitions: Record<ReviewablePostStatus, Partial<Record<PostAction, PostReviewOutcome>>> = {
  drafting: {},
  evaluating: {},
  verifying: {},
  image_pending: {},
  ready_for_review: {
    edit: "ready_for_review",
    approve: "approved",
    reject: "rejected",
  },
  changes_requested: {
    edit: "ready_for_review",
    reject: "rejected",
  },
  approved: {},
  rejected: {},
};

export function nextPostStatus(
  status: ReviewablePostStatus,
  action: PostAction,
): PostReviewOutcome | null {
  return transitions[status][action] ?? null;
}

export function assertCurrentVersion(currentVersionId: string, expectedVersionId: string) {
  if (currentVersionId !== expectedVersionId) {
    throw new Error("Post version is stale.");
  }
}
