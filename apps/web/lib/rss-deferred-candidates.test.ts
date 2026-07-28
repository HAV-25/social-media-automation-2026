import { describe, expect, it } from "vitest";
import { selectDeferredRssCandidates } from "./rss-deferred-candidates";

const requestedAt = "2026-07-28T09:30:00.000Z";
const sourceA = "00000000-0000-4000-8000-000000000001";
const sourceB = "00000000-0000-4000-8000-000000000002";
const sourceC = "00000000-0000-4000-8000-000000000003";

describe("deferred RSS candidate selection", () => {
  it("returns recent unprepared RSS opportunities in deterministic score order", () => {
    const result = selectDeferredRssCandidates({
      requestedAt,
      blockedOpportunityIds: new Set(),
      rssSourceDocumentIds: new Set([sourceA, sourceB]),
      opportunities: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          source_document_id: sourceA,
          opportunity_score: 80.25,
          status: "candidate",
          created_at: "2026-07-27T14:00:00.000Z",
        },
        {
          id: "10000000-0000-4000-8000-000000000002",
          source_document_id: sourceB,
          opportunity_score: 84,
          status: "candidate",
          created_at: "2026-07-27T15:00:00.000Z",
        },
      ],
    });

    expect(result.map((opportunity) => opportunity.id)).toEqual([
      "10000000-0000-4000-8000-000000000002",
      "10000000-0000-4000-8000-000000000001",
    ]);
  });

  it("excludes prepared, reserved, non-RSS, and expired opportunities", () => {
    const result = selectDeferredRssCandidates({
      requestedAt,
      blockedOpportunityIds: new Set([
        "10000000-0000-4000-8000-000000000001",
        "10000000-0000-4000-8000-000000000002",
      ]),
      rssSourceDocumentIds: new Set([sourceA, sourceB]),
      opportunities: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          source_document_id: sourceA,
          opportunity_score: 90,
          status: "ready_to_generate",
          created_at: "2026-07-28T08:00:00.000Z",
        },
        {
          id: "10000000-0000-4000-8000-000000000002",
          source_document_id: sourceB,
          opportunity_score: 89,
          status: "candidate",
          created_at: "2026-07-28T07:00:00.000Z",
        },
        {
          id: "10000000-0000-4000-8000-000000000003",
          source_document_id: sourceC,
          opportunity_score: 88,
          status: "candidate",
          created_at: "2026-07-28T06:00:00.000Z",
        },
        {
          id: "10000000-0000-4000-8000-000000000004",
          source_document_id: sourceA,
          opportunity_score: 87,
          status: "candidate",
          created_at: "2026-07-27T08:00:00.000Z",
        },
      ],
    });

    expect(result).toEqual([]);
  });
});
