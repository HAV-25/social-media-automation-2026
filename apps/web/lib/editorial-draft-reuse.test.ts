import { describe, expect, it } from "vitest";
import { buildDraftReusePlan, orderDraftResults } from "./editorial-draft-reuse";

const ids = {
  newsDraft: "10000000-0000-4000-8000-000000000001",
  newsVersion: "20000000-0000-4000-8000-000000000001",
  newsRun: "30000000-0000-4000-8000-000000000001",
  educationDraft: "10000000-0000-4000-8000-000000000002",
  educationVersion: "20000000-0000-4000-8000-000000000002",
  educationRun: "30000000-0000-4000-8000-000000000002",
};

describe("editorial draft reuse", () => {
  it("reuses durable review-ready drafts and generates only missing styles", () => {
    const plan = buildDraftReusePlan({
      requestedStyles: [
        "newsworthy_authority",
        "educational_breakdown",
        "perspective_conversation",
      ],
      rawDrafts: [
        {
          id: ids.newsDraft,
          current_version_id: ids.newsVersion,
          content_style: "newsworthy_authority",
          tone: "thoughtful",
          status: "ready_for_review",
        },
      ],
      rawRuns: [
        {
          id: ids.newsRun,
          entity_id: ids.newsDraft,
          created_at: "2026-07-26T10:00:00.000Z",
        },
      ],
    });

    expect(plan.reused).toEqual([
      {
        contentStyle: "newsworthy_authority",
        result: {
          contractVersion: "1.0",
          postDraftId: ids.newsDraft,
          postVersionId: ids.newsVersion,
          generationRunId: ids.newsRun,
          status: "ready_for_review",
          duplicate: true,
        },
      },
    ]);
    expect(plan.missingStyles).toEqual(["educational_breakdown", "perspective_conversation"]);
    expect(plan.blockedStyles).toEqual([]);
  });

  it("blocks paid regeneration when an existing draft is terminal or lacks provenance", () => {
    const plan = buildDraftReusePlan({
      requestedStyles: ["newsworthy_authority", "educational_breakdown"],
      rawDrafts: [
        {
          id: ids.newsDraft,
          current_version_id: ids.newsVersion,
          content_style: "newsworthy_authority",
          tone: "thoughtful",
          status: "approved",
        },
        {
          id: ids.educationDraft,
          current_version_id: ids.educationVersion,
          content_style: "educational_breakdown",
          tone: "thoughtful",
          status: "ready_for_review",
        },
      ],
      rawRuns: [],
    });

    expect(plan.reused).toEqual([]);
    expect(plan.missingStyles).toEqual([]);
    expect(plan.blockedStyles).toEqual(["newsworthy_authority", "educational_breakdown"]);
  });

  it("returns reused and newly generated results in the requested style order", () => {
    const ordered = orderDraftResults({
      requestedStyles: ["newsworthy_authority", "educational_breakdown"],
      reused: [
        {
          contentStyle: "newsworthy_authority",
          result: {
            contractVersion: "1.0",
            postDraftId: ids.newsDraft,
            postVersionId: ids.newsVersion,
            generationRunId: ids.newsRun,
            status: "ready_for_review",
            duplicate: true,
          },
        },
      ],
      generated: [
        {
          contentStyle: "educational_breakdown",
          result: {
            contractVersion: "1.0",
            postDraftId: ids.educationDraft,
            postVersionId: ids.educationVersion,
            generationRunId: ids.educationRun,
            status: "ready_for_review",
            duplicate: false,
          },
        },
      ],
    });

    expect(ordered.map((result) => result.postDraftId)).toEqual([
      ids.newsDraft,
      ids.educationDraft,
    ]);
  });
});
