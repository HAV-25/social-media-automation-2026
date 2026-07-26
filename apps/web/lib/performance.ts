import "server-only";
import { z } from "zod";
import {
  brandAiCostObservabilitySchema,
  emptyBrandAiCostObservability,
} from "./cost-observability-core";
import {
  brandPerformanceDashboardSchema,
  performanceWindowSchema,
  performanceWindowStart,
  type BrandPerformanceDashboard,
} from "./performance-core";
import { createSupabaseServerClient } from "./supabase/server";

function demoDashboard(brandId: string, since: string, until: string): BrandPerformanceDashboard {
  const recent = new Date(new Date(until).getTime() - 8 * 60_000).toISOString();
  return brandPerformanceDashboardSchema.parse({
    brandId,
    since,
    until,
    feedHealth: {
      totalCount: 3,
      activeCount: 3,
      healthyCount: 2,
      attentionCount: 1,
      pausedCount: 0,
      feeds: [
        {
          id: "21000000-0000-4000-8000-000000000001",
          name: "IEEE Spectrum Robotics",
          active: true,
          lastPolledAt: recent,
          lastSuccessAt: recent,
          consecutiveFailures: 0,
          status: "healthy",
        },
        {
          id: "21000000-0000-4000-8000-000000000002",
          name: "The Robot Report",
          active: true,
          lastPolledAt: recent,
          lastSuccessAt: recent,
          consecutiveFailures: 0,
          status: "healthy",
        },
        {
          id: "21000000-0000-4000-8000-000000000003",
          name: "TechCrunch",
          active: true,
          lastPolledAt: null,
          lastSuccessAt: null,
          consecutiveFailures: 0,
          status: "never_polled",
        },
      ],
    },
    decisions: {
      approvedCount: 2,
      rejectedCount: 1,
      changesRequestedCount: 1,
      approvalRate: 66.7,
      pendingReviewCount: 3,
      rejectionReasons: [{ reason: "The opening is too generic for Klaank.", count: 1 }],
    },
    generationVolume: {
      opportunityCount: 2,
      draftCount: 6,
      reviewReadyCount: 5,
      imageReadyCount: 2,
      byStyle: [
        { style: "newsworthy_authority", count: 2 },
        { style: "educational_breakdown", count: 2 },
        { style: "perspective_conversation", count: 2 },
      ],
      successfulRunsByType: [
        { runType: "research", count: 2 },
        { runType: "post_generation", count: 6 },
        { runType: "image_generation", count: 2 },
      ],
    },
  });
}

export async function getBrandPerformanceDashboard(
  brandId: string,
  rawWindow: z.input<typeof performanceWindowSchema>,
) {
  const window = performanceWindowSchema.parse(rawWindow);
  const until = new Date().toISOString();
  const since = performanceWindowStart(window, new Date(until));

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    return {
      window,
      dashboard: demoDashboard(brandId, since, until),
      cost: emptyBrandAiCostObservability(brandId, since),
    };
  }

  const supabase = await createSupabaseServerClient();
  const [dashboardResult, costResult] = await Promise.all([
    supabase.rpc("get_brand_performance_dashboard", {
      p_brand_id: brandId,
      p_since: since,
      p_until: until,
    }),
    supabase.rpc("get_brand_ai_cost_observability", {
      p_brand_id: brandId,
      p_since: since,
    }),
  ]);
  if (dashboardResult.error || costResult.error) {
    throw new Error("Brand performance could not be loaded.");
  }

  return {
    window,
    dashboard: brandPerformanceDashboardSchema.parse(dashboardResult.data),
    cost: brandAiCostObservabilitySchema.parse(costResult.data),
  };
}
