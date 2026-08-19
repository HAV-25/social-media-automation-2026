import { isPendingReadyStatus } from "./ready-post-filters";
import type { ReadyPost } from "./ready-posts";

export type ReadyPostGroup = {
  opportunityId: string;
  sourceTitle: string;
  // Angle variants for this topic, ordered top-ranked (highest quality) first.
  posts: ReadyPost[];
  // How many angles still await a review decision.
  pendingCount: number;
  topQualityScore: number | null;
};

function byQualityThenRecency(left: ReadyPost, right: ReadyPost): number {
  if (left.qualityScore === null && right.qualityScore === null) {
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  }
  if (left.qualityScore === null) return 1;
  if (right.qualityScore === null) return -1;
  if (right.qualityScore !== left.qualityScore) {
    return right.qualityScore - left.qualityScore;
  }
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

// Groups the flat review-queue list by topic (opportunity). Within a group the
// angle variants are ordered top-ranked (highest quality) first; groups that
// still contain undecided angles float above fully-decided ones, otherwise the
// incoming order (which already reflects the caller's chosen sort) is preserved.
export function groupReadyPosts(posts: ReadyPost[]): ReadyPostGroup[] {
  const buckets = new Map<string, ReadyPost[]>();
  for (const post of posts) {
    const bucket = buckets.get(post.opportunityId);
    if (bucket) bucket.push(post);
    else buckets.set(post.opportunityId, [post]);
  }

  const groups: ReadyPostGroup[] = [];
  for (const [opportunityId, bucket] of buckets) {
    const ranked = [...bucket].sort(byQualityThenRecency);
    groups.push({
      opportunityId,
      sourceTitle: ranked[0]?.sourceTitle ?? "Original source",
      posts: ranked,
      pendingCount: ranked.filter((post) => isPendingReadyStatus(post.status)).length,
      topQualityScore: ranked[0]?.qualityScore ?? null,
    });
  }

  return groups
    .map((group, index) => ({ group, index }))
    .sort((left, right) => {
      const leftDecided = left.group.pendingCount > 0 ? 0 : 1;
      const rightDecided = right.group.pendingCount > 0 ? 0 : 1;
      if (leftDecided !== rightDecided) return leftDecided - rightDecided;
      return left.index - right.index;
    })
    .map((entry) => entry.group);
}
