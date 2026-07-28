import { describe, expect, it } from "vitest";
import {
  classifyDeferredRssProgress,
  selectDeferredRssCandidates,
} from "./rss-deferred-candidates";

const requestedAt = "2026-07-28T09:30:00.000Z";
const sourceA = "00000000-0000-4000-8000-000000000001";
const sourceB = "00000000-0000-4000-8000-000000000002";
const sourceC = "00000000-0000-4000-8000-000000000003";

describe("deferred RSS candidate selection", () => {
  it("retries a reserved opportunity only before downstream work has started", () => {
    const reservedOpportunityId = "10000000-0000-4000-8000-000000000001";
    const downstreamOpportunityId = "10000000-0000-4000-8000-000000000002";
    const draftedOpportunityId = "10000000-0000-4000-8000-000000000003";
    const reservationRunId = "20000000-0000-4000-8000-000000000001";
    const progress = classifyDeferredRssProgress({
      draftedOpportunityIds: [draftedOpportunityId],
      runs: [
        {
          id: reservationRunId,
          entity_id: reservedOpportunityId,
          run_type: "rss_opportunity_reservation",
          status: "succeeded",
        },
        {
          id: "20000000-0000-4000-8000-000000000002",
          entity_id: downstreamOpportunityId,
          run_type: "research",
          status: "failed",
        },
      ],
    });

    expect(progress.existingReservationByOpportunity.get(reservedOpportunityId)).toBe(
      reservationRunId,
    );
    expect(progress.blockedOpportunityIds.has(reservedOpportunityId)).toBe(false);
    expect(progress.blockedOpportunityIds.has(downstreamOpportunityId)).toBe(true);
    expect(progress.blockedOpportunityIds.has(draftedOpportunityId)).toBe(true);
  });

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
