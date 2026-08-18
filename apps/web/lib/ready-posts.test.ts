import { describe, expect, it } from "vitest";
import { groupReadyPosts } from "./ready-post-grouping";
import { parseReadyPostFilters } from "./ready-post-filters";
import type { ReadyPost } from "./ready-posts";

describe("ready post filters", () => {
  it("accepts bounded review filters and sort order", () => {
    expect(
      parseReadyPostFilters({
        window: "7d",
        status: "changes_requested",
        style: "educational_breakdown",
        tone: "thoughtful",
        sort: "quality_desc",
      }),
    ).toEqual({
      window: "7d",
      status: "changes_requested",
      style: "educational_breakdown",
      tone: "thoughtful",
      sort: "quality_desc",
    });
  });

  it("accepts decided states so approved and rejected posts can be filtered", () => {
    expect(parseReadyPostFilters({ status: "approved" }).status).toBe("approved");
    expect(parseReadyPostFilters({ status: "rejected" }).status).toBe("rejected");
  });

  it("falls back safely when URL parameters are hostile or malformed", () => {
    expect(
      parseReadyPostFilters({
        window: "../../../../etc",
        status: "drafting",
        style: "<script>",
        tone: ["bold", "witty"],
        sort: "DROP TABLE",
      }),
    ).toEqual({
      window: "all",
      status: "all",
      style: "all",
      tone: "bold",
      sort: "updated_desc",
    });
  });
});

function makePost(
  overrides: Partial<ReadyPost> & Pick<ReadyPost, "id" | "opportunityId">,
): ReadyPost {
  return {
    sourceTitle: "Topic",
    contentStyle: "newsworthy_authority",
    tone: "authoritative",
    status: "ready_for_review",
    qualityScore: 90,
    versionNumber: 1,
    hook: "hook",
    excerpt: "excerpt",
    updatedAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

describe("groupReadyPosts", () => {
  it("groups angles by topic and orders them top-ranked first", () => {
    const groups = groupReadyPosts([
      makePost({ id: "a1", opportunityId: "A", qualityScore: 91 }),
      makePost({ id: "a2", opportunityId: "A", qualityScore: 97 }),
      makePost({ id: "a3", opportunityId: "A", qualityScore: 94 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.posts.map((post) => post.id)).toEqual(["a2", "a3", "a1"]);
    expect(groups[0]?.topQualityScore).toBe(97);
    expect(groups[0]?.pendingCount).toBe(3);
  });

  it("floats topics with undecided angles above fully-decided ones", () => {
    const groups = groupReadyPosts([
      // Incoming order puts the fully-decided topic first.
      makePost({ id: "d1", opportunityId: "DECIDED", status: "approved", qualityScore: 97 }),
      makePost({ id: "d2", opportunityId: "DECIDED", status: "rejected", qualityScore: 95 }),
      makePost({
        id: "p1",
        opportunityId: "PENDING",
        status: "ready_for_review",
        qualityScore: 80,
      }),
    ]);

    expect(groups.map((group) => group.opportunityId)).toEqual(["PENDING", "DECIDED"]);
    expect(groups[0]?.pendingCount).toBe(1);
    expect(groups[1]?.pendingCount).toBe(0);
  });

  it("keeps null-scored angles last within a topic", () => {
    const groups = groupReadyPosts([
      makePost({ id: "n1", opportunityId: "A", qualityScore: null }),
      makePost({ id: "s1", opportunityId: "A", qualityScore: 88 }),
    ]);

    expect(groups[0]?.posts.map((post) => post.id)).toEqual(["s1", "n1"]);
    expect(groups[0]?.topQualityScore).toBe(88);
  });
});
