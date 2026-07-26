import { z } from "zod";

const countSchema = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const performanceWindowSchema = z.enum(["24h", "7d", "30d"]);

const feedHealthStatusSchema = z.enum(["healthy", "stale", "failing", "never_polled", "paused"]);

export const brandPerformanceDashboardSchema = z
  .object({
    brandId: z.uuid(),
    since: z.iso.datetime({ offset: true }),
    until: z.iso.datetime({ offset: true }),
    feedHealth: z
      .object({
        totalCount: countSchema,
        activeCount: countSchema,
        healthyCount: countSchema,
        attentionCount: countSchema,
        pausedCount: countSchema,
        feeds: z.array(
          z
            .object({
              id: z.uuid(),
              name: z.string().trim().min(1).max(200),
              active: z.boolean(),
              lastPolledAt: z.iso.datetime({ offset: true }).nullable(),
              lastSuccessAt: z.iso.datetime({ offset: true }).nullable(),
              consecutiveFailures: countSchema,
              status: feedHealthStatusSchema,
            })
            .strict(),
        ),
      })
      .strict(),
    decisions: z
      .object({
        approvedCount: countSchema,
        rejectedCount: countSchema,
        changesRequestedCount: countSchema,
        approvalRate: z.coerce.number().min(0).max(100).nullable(),
        pendingReviewCount: countSchema,
        rejectionReasons: z.array(
          z
            .object({
              reason: z.string().trim().min(1).max(2_000),
              count: countSchema,
            })
            .strict(),
        ),
      })
      .strict(),
    generationVolume: z
      .object({
        opportunityCount: countSchema,
        draftCount: countSchema,
        reviewReadyCount: countSchema,
        imageReadyCount: countSchema,
        byStyle: z.array(
          z
            .object({
              style: z.string().trim().min(1).max(100),
              count: countSchema,
            })
            .strict(),
        ),
        successfulRunsByType: z.array(
          z
            .object({
              runType: z.string().trim().min(1).max(200),
              count: countSchema,
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();

export type PerformanceWindow = z.infer<typeof performanceWindowSchema>;
export type BrandPerformanceDashboard = z.infer<typeof brandPerformanceDashboardSchema>;
export type FeedHealthStatus = z.infer<typeof feedHealthStatusSchema>;

export function performanceWindowStart(window: PerformanceWindow, now = new Date()) {
  const hours = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 }[window];
  return new Date(now.getTime() - hours * 60 * 60 * 1_000).toISOString();
}

const styleLabels: Record<string, string> = {
  newsworthy_authority: "Newsworthy",
  educational_breakdown: "Educational",
  perspective_conversation: "Perspective",
};

const runTypeLabels: Record<string, string> = {
  research: "Research packages",
  post_generation: "Post-writing calls",
  editorial_generation: "Editorial orchestration",
  post_verification: "Post verification",
  image_generation: "Generated images",
};

export function performanceStyleLabel(style: string) {
  return styleLabels[style] ?? style.replaceAll("_", " ");
}

export function performanceRunTypeLabel(runType: string) {
  return runTypeLabels[runType] ?? runType.replaceAll("_", " ");
}

export function feedHealthLabel(status: FeedHealthStatus) {
  const labels: Record<FeedHealthStatus, string> = {
    healthy: "Healthy",
    stale: "Polling late",
    failing: "Needs attention",
    never_polled: "Not polled yet",
    paused: "Paused",
  };
  return labels[status];
}
