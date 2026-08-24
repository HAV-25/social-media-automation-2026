export type ReviewablePostStatus =
  | "drafting"
  | "evaluating"
  | "verifying"
  | "image_pending"
  | "ready_for_review"
  | "changes_requested"
  | "approved"
  | "rejected";
export type PostAction = "edit" | "approve" | "reject" | "request_changes";

// A review action can only ever land on one of these outcome statuses; the
// in-progress statuses (drafting/verifying/…) are valid *source* states but are
// never produced by a transition.
export type PostReviewOutcome = "ready_for_review" | "changes_requested" | "approved" | "rejected";

// Only ready_for_review / changes_requested accept review actions. In-progress
// and terminal states are no-ops here (kept in the map so nextPostStatus is
// total and never dereferences undefined).
const transitions: Record<
  ReviewablePostStatus,
  Partial<Record<PostAction, PostReviewOutcome>>
> = {
  drafting: {},
  evaluating: {},
  verifying: {},
  image_pending: {},
  ready_for_review: {
    edit: "ready_for_review",
    approve: "approved",
    reject: "rejected",
    request_changes: "changes_requested",
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
