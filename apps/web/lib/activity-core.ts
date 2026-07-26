import { z } from "zod";

export const activityFilterSchema = z
  .object({
    view: z.enum(["all", "human", "system", "feedback"]).default("all"),
    window: z.enum(["24h", "7d", "30d", "all"]).default("7d"),
    search: z.string().trim().max(100).default(""),
  })
  .strict();

export type ActivityFilter = z.infer<typeof activityFilterSchema>;

export const activityRowSchema = z
  .object({
    id: z.uuid(),
    actor_id: z.uuid().nullable(),
    action: z.string().min(1).max(160),
    entity_type: z.string().min(1).max(100),
    entity_id: z.uuid().nullable(),
    metadata: z.record(z.string(), z.unknown()),
    created_at: z.iso.datetime({ offset: true }),
  })
  .strict();

export type ActivityKind = "human" | "system" | "feedback";

export function activityKind(action: string, actorId: string | null): ActivityKind {
  if (
    /(?:approve|reject|request_changes|changes_requested|feedback|edit|resurface)/i.test(action)
  ) {
    return "feedback";
  }
  return actorId ? "human" : "system";
}

export function activityLabel(action: string) {
  const labels: Record<string, string> = {
    "post.approve": "Post approved",
    "post.reject": "Post rejected",
    "post.request_changes": "Changes requested",
    "post.draft.created": "Post draft created",
    "post.draft.reused": "Existing post draft reused",
    "post.draft.edited": "Post edited",
    "rss_item.resurfaced": "RSS article resurfaced",
    "rss_feed.upserted": "RSS feed configuration saved",
    "source.extraction_failed": "Source extraction failed",
    "run.manual_recovery_requested": "Manual recovery requested",
  };
  return (
    labels[action] ??
    action.replaceAll(/[._]/g, " ").replace(/^\w/, (letter) => letter.toUpperCase())
  );
}

export function activityReason(metadata: Record<string, unknown>) {
  const reason = metadata.reason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

export function activityEntityHref(entityType: string, entityId: string | null) {
  if (!entityId) return null;
  if (entityType === "post_draft") return `/posts/${entityId}`;
  if (entityType === "opportunity") return `/opportunities/${entityId}`;
  if (entityType === "generation_run") return `/runs?entity=${entityId}`;
  return null;
}

export function activityWindowStart(window: ActivityFilter["window"], now = new Date()) {
  if (window === "all") return null;
  const hours = window === "24h" ? 24 : window === "7d" ? 24 * 7 : 24 * 30;
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}
