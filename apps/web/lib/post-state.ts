export type ReviewablePostStatus =
  | "ready_for_review"
  | "changes_requested"
  | "approved"
  | "rejected";
export type PostAction = "edit" | "approve" | "reject" | "request_changes";

const transitions: Record<
  ReviewablePostStatus,
  Partial<Record<PostAction, ReviewablePostStatus>>
> = {
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

export function nextPostStatus(status: ReviewablePostStatus, action: PostAction) {
  return transitions[status][action] ?? null;
}

export function assertCurrentVersion(currentVersionId: string, expectedVersionId: string) {
  if (currentVersionId !== expectedVersionId) {
    throw new Error("Post version is stale.");
  }
}
