import { describe, expect, it } from "vitest";
import {
  brandPerformanceDashboardSchema,
  feedHealthLabel,
  performanceRunTypeLabel,
  performanceStyleLabel,
  performanceWindowStart,
} from "./performance-core";

describe("brand performance dashboard", () => {
  it("accepts bounded operational metrics and rejects unknown output", () => {
    const parsed = brandPerformanceDashboardSchema.parse({
      brandId: "10000000-0000-4000-8000-000000000001",
      since: "2026-07-25T00:00:00+00:00",
      until: "2026-07-26T00:00:00+00:00",
      feedHealth: {
        totalCount: 2,
        activeCount: 2,
        healthyCount: 1,
        attentionCount: 1,
        pausedCount: 0,
        feeds: [
          {
            id: "20000000-0000-4000-8000-000000000001",
            name: "Robotics feed",
            active: true,
            lastPolledAt: "2026-07-25T23:55:00+00:00",
            lastSuccessAt: "2026-07-25T23:55:00+00:00",
            consecutiveFailures: 0,
            status: "healthy",
          },
        ],
      },
      decisions: {
        approvedCount: 2,
        rejectedCount: 1,
        changesRequestedCount: 1,
        approvalRate: 66.7,
        pendingReviewCount: 3,
        rejectionReasons: [{ reason: "The opening is too generic.", count: 1 }],
      },
      generationVolume: {
        opportunityCount: 2,
        draftCount: 6,
        reviewReadyCount: 5,
        imageReadyCount: 2,
        byStyle: [{ style: "newsworthy_authority", count: 2 }],
        successfulRunsByType: [{ runType: "research", count: 2 }],
      },
    });

    expect(parsed.decisions.approvalRate).toBe(66.7);
    expect(() =>
      brandPerformanceDashboardSchema.parse({
        ...parsed,
        leakedProviderResponse: "not allowed",
      }),
    ).toThrow();
  });

  it("calculates deterministic windows and business labels", () => {
    expect(performanceWindowStart("24h", new Date("2026-07-26T12:00:00Z"))).toBe(
      "2026-07-25T12:00:00.000Z",
    );
    expect(performanceStyleLabel("educational_breakdown")).toBe("Educational");
    expect(performanceRunTypeLabel("image_generation")).toBe("Generated images");
    expect(feedHealthLabel("stale")).toBe("Polling late");
  });
});
