import "server-only";
import { z } from "zod";
import {
  activityFilterSchema,
  activityKind,
  activityReason,
  activityRowSchema,
  activityWindowStart,
  type ActivityFilter,
  type ActivityKind,
} from "./activity-core";
import { createSupabaseServerClient } from "./supabase/server";

export type ActivityItem = {
  id: string;
  action: string;
  kind: ActivityKind;
  entityType: string;
  entityId: string | null;
  actorName: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ActivitySnapshot = {
  items: ActivityItem[];
  totals: { all: number; feedback: number; human: number; system: number };
  limited: boolean;
};

const MAX_ROWS = 100;
const profileRowSchema = z.object({ user_id: z.uuid(), display_name: z.string().nullable() });

function demoActivity(): ActivityItem[] {
  const now = Date.now();
  return [
    {
      id: "87000000-0000-4000-8000-000000000001",
      action: "post.approve",
      kind: "feedback",
      entityType: "post_draft",
      entityId: "82000000-0000-4000-8000-000000000001",
      actorName: "Demo reviewer",
      reason: null,
      metadata: {},
      createdAt: new Date(now - 35 * 60_000).toISOString(),
    },
    {
      id: "87000000-0000-4000-8000-000000000002",
      action: "post.request_changes",
      kind: "feedback",
      entityType: "post_draft",
      entityId: "82000000-0000-4000-8000-000000000002",
      actorName: "Demo reviewer",
      reason: "Make the opening more specific to robotics buyers.",
      metadata: { reason: "Make the opening more specific to robotics buyers." },
      createdAt: new Date(now - 2 * 60 * 60_000).toISOString(),
    },
    {
      id: "87000000-0000-4000-8000-000000000003",
      action: "post.draft.created",
      kind: "system",
      entityType: "post_draft",
      entityId: "82000000-0000-4000-8000-000000000003",
      actorName: "Workflow",
      reason: null,
      metadata: {},
      createdAt: new Date(now - 3 * 60 * 60_000).toISOString(),
    },
  ];
}

export async function getBrandActivity(
  brandId: string,
  input: Partial<ActivityFilter>,
): Promise<ActivitySnapshot> {
  const filter = activityFilterSchema.parse(input);
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    return summarize(filterActivity(demoActivity(), filter), false);
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("audit_logs")
    .select("id,actor_id,action,entity_type,entity_id,metadata,created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS + 1);
  const start = activityWindowStart(filter.window);
  if (start) query = query.gte("created_at", start);
  const { data, error } = await query;
  if (error) throw new Error(`Unable to load activity history: ${error.message}`);

  const rows = z.array(activityRowSchema).parse((data ?? []).slice(0, MAX_ROWS));
  const actorIds = [...new Set(rows.flatMap((row) => (row.actor_id ? [row.actor_id] : [])))];
  const profilesById = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("user_id,display_name")
      .in("user_id", actorIds);
    if (profileError) throw new Error(`Unable to load activity actors: ${profileError.message}`);
    for (const profile of z.array(profileRowSchema).parse(profiles ?? [])) {
      profilesById.set(profile.user_id, profile.display_name ?? "Authorized user");
    }
  }

  const items = rows.map(
    (row): ActivityItem => ({
      id: row.id,
      action: row.action,
      kind: activityKind(row.action, row.actor_id),
      entityType: row.entity_type,
      entityId: row.entity_id,
      actorName: row.actor_id ? (profilesById.get(row.actor_id) ?? "Authorized user") : "Workflow",
      reason: activityReason(row.metadata),
      metadata: row.metadata,
      createdAt: row.created_at,
    }),
  );
  return summarize(filterActivity(items, filter), (data?.length ?? 0) > MAX_ROWS);
}

function filterActivity(items: ActivityItem[], filter: ActivityFilter) {
  const search = filter.search.toLocaleLowerCase();
  return items.filter((item) => {
    if (filter.view !== "all" && item.kind !== filter.view) return false;
    if (!search) return true;
    return [item.action, item.actorName, item.entityType, item.reason ?? ""].some((value) =>
      value.toLocaleLowerCase().includes(search),
    );
  });
}

function summarize(items: ActivityItem[], limited: boolean): ActivitySnapshot {
  return {
    items,
    limited,
    totals: {
      all: items.length,
      feedback: items.filter((item) => item.kind === "feedback").length,
      human: items.filter((item) => item.kind === "human").length,
      system: items.filter((item) => item.kind === "system").length,
    },
  };
}
