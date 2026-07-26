import "server-only";
import { operationsRunFilterSchema, type OperationsRunFilter } from "@content-engine/contracts";
import { z } from "zod";
import {
  brandAiCostObservabilitySchema,
  emptyBrandAiCostObservability,
} from "./cost-observability-core";
import { demoBrands } from "./demo-data";
import {
  decodeOperationsCursor,
  encodeOperationsCursor,
  normalizeOperationsRun,
  safeParseOperationsRun,
  type RawOperationsRun,
  type SafeRunRecovery,
} from "./operations-core";
import { createSupabaseServerClient } from "./supabase/server";

const PAGE_SIZE = 20;
const STALLED_AFTER_MS = 15 * 60_000;

const eventRowSchema = z.object({
  generation_run_id: z.uuid().nullable(),
  event_type: z.string().min(1),
  to_status: z.string().nullable(),
  created_at: z.iso.datetime({ offset: true }),
});

const recoveryRowSchema = z.object({
  id: z.uuid(),
  root_generation_run_id: z.uuid(),
  active_generation_run_id: z.uuid(),
  status: z.enum([
    "registered",
    "scheduled",
    "dispatching",
    "retrying",
    "completed",
    "recovered",
    "dead_letter",
    "cancelled",
  ]),
  category: z
    .enum(["transient", "permanent", "validation", "security", "budget", "provider", "unknown"])
    .nullable(),
  error_code: z.string().nullable(),
  retryable: z.boolean(),
  attempt_count: z.number().int(),
  max_attempts: z.number().int(),
  next_retry_at: z.iso.datetime({ offset: true }).nullable(),
  manual_requested: z.boolean(),
});

function normalizeRecovery(raw: z.infer<typeof recoveryRowSchema>): SafeRunRecovery {
  return {
    id: raw.id,
    status: raw.status,
    category: raw.category,
    errorCode: raw.error_code,
    retryable: raw.retryable,
    attemptCount: raw.attempt_count,
    maxAttempts: raw.max_attempts,
    nextRetryAt: raw.next_retry_at,
    manualRequested: raw.manual_requested,
  };
}

function demoRecovery(runId: string, manuallyQueued: boolean): SafeRunRecovery | null {
  if (runId === "81000000-0000-4000-8000-000000000001") {
    return {
      id: "84000000-0000-4000-8000-000000000001",
      status: manuallyQueued ? "scheduled" : "registered",
      category: manuallyQueued ? "transient" : null,
      errorCode: manuallyQueued ? "manual_recovery" : null,
      retryable: manuallyQueued,
      attemptCount: 0,
      maxAttempts: 3,
      nextRetryAt: manuallyQueued ? new Date().toISOString() : null,
      manualRequested: manuallyQueued,
    };
  }
  if (runId === "81000000-0000-4000-8000-000000000002") {
    return {
      id: "84000000-0000-4000-8000-000000000002",
      status: manuallyQueued ? "scheduled" : "scheduled",
      category: "provider",
      errorCode: manuallyQueued ? "manual_recovery" : "provider_timeout",
      retryable: true,
      attemptCount: 1,
      maxAttempts: 3,
      nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
      manualRequested: manuallyQueued,
    };
  }
  return null;
}

function isoAgo(milliseconds: number) {
  return new Date(Date.now() - milliseconds).toISOString();
}

function demoRuns(brandId: string): RawOperationsRun[] {
  const knownBrand = demoBrands.some((brand) => brand.id === brandId);
  if (!knownBrand) return [];
  return [
    {
      id: "81000000-0000-4000-8000-000000000001",
      brand_id: brandId,
      run_type: "image_generation",
      entity_type: "post_draft",
      entity_id: "82000000-0000-4000-8000-000000000001",
      workflow_name: "WF-08 Image Generation",
      workflow_execution_id: "demo-execution-81",
      correlation_id: "83000000-0000-4000-8000-000000000001",
      idempotency_key: "demo-image-run-idempotency-0001",
      attempt: 1,
      status: "running",
      started_at: isoAgo(22 * 60_000),
      completed_at: null,
      model_usage: {
        model: "fake-image-v1",
        promptVersion: "image-director-v1",
        estimatedCostUsd: 0,
      },
      error: null,
      created_at: isoAgo(22 * 60_000),
    },
    {
      id: "81000000-0000-4000-8000-000000000002",
      brand_id: brandId,
      run_type: "research",
      entity_type: "opportunity",
      entity_id: "82000000-0000-4000-8000-000000000002",
      workflow_name: "WF-05 Research",
      workflow_execution_id: "demo-execution-82",
      correlation_id: "83000000-0000-4000-8000-000000000002",
      idempotency_key: "demo-research-run-idempotency-0002",
      attempt: 2,
      status: "failed",
      started_at: isoAgo(56 * 60_000),
      completed_at: isoAgo(53 * 60_000),
      model_usage: {
        model: "fake-research-v1",
        promptVersion: "evidence-synthesizer-v1",
        usage: { inputTokens: 1380, outputTokens: 720 },
        estimatedCostUsd: 0,
      },
      error: {
        code: "provider_timeout",
        message: "Bearer sk-demo-secret raw provider payload must never appear",
        retryable: true,
      },
      created_at: isoAgo(56 * 60_000),
    },
    {
      id: "81000000-0000-4000-8000-000000000003",
      brand_id: brandId,
      run_type: "editorial_generation",
      entity_type: "post_draft",
      entity_id: "82000000-0000-4000-8000-000000000003",
      workflow_name: "WF-06 Angle and Post Generation",
      workflow_execution_id: "demo-execution-83",
      correlation_id: "83000000-0000-4000-8000-000000000003",
      idempotency_key: "demo-editorial-run-idempotency-0003",
      attempt: 1,
      status: "succeeded",
      started_at: isoAgo(3 * 60 * 60_000),
      completed_at: isoAgo(3 * 60 * 60_000 - 48_000),
      model_usage: {
        model: "fake-editorial-v1",
        promptVersion: "facebook-writer-v1",
        usage: { inputTokens: 1640, outputTokens: 510 },
        costUsd: 0,
      },
      error: null,
      created_at: isoAgo(3 * 60 * 60_000),
    },
    {
      id: "81000000-0000-4000-8000-000000000004",
      brand_id: brandId,
      run_type: "source_extraction",
      entity_type: "source_document",
      entity_id: "82000000-0000-4000-8000-000000000004",
      workflow_name: "app-source-extraction",
      workflow_execution_id: null,
      correlation_id: "83000000-0000-4000-8000-000000000004",
      idempotency_key: "demo-source-run-idempotency-0004",
      attempt: 1,
      status: "failed",
      started_at: isoAgo(8 * 60 * 60_000),
      completed_at: isoAgo(8 * 60 * 60_000 - 400),
      model_usage: {},
      error: {
        code: "unsafe_source",
        message: "Internal network target 169.254.169.254 was blocked",
        retryable: false,
      },
      created_at: isoAgo(8 * 60 * 60_000),
    },
    {
      id: "81000000-0000-4000-8000-000000000005",
      brand_id: brandId,
      run_type: "post_verification",
      entity_type: "post_draft",
      entity_id: "82000000-0000-4000-8000-000000000005",
      workflow_name: "WF-07 Post Verification",
      workflow_execution_id: "demo-execution-85",
      correlation_id: "83000000-0000-4000-8000-000000000005",
      idempotency_key: "demo-verification-run-idempotency-0005",
      attempt: 1,
      status: "succeeded",
      started_at: isoAgo(26 * 60 * 60_000),
      completed_at: isoAgo(26 * 60 * 60_000 - 1300),
      model_usage: { model: "deterministic-verifier-v1", costUsd: 0 },
      error: null,
      created_at: isoAgo(26 * 60 * 60_000),
    },
  ];
}

function windowStart(window: OperationsRunFilter["window"]) {
  const durations = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 } as const;
  return window === "all" ? null : isoAgo(durations[window] * 60 * 60_000);
}

function matchesFilter(
  run: ReturnType<typeof normalizeOperationsRun>,
  filter: OperationsRunFilter,
) {
  if (filter.runType && run.runType !== filter.runType) return false;
  if (filter.view === "in_progress" && !["queued", "running"].includes(run.status)) return false;
  if (filter.view === "failed" && run.status !== "failed") return false;
  if (filter.view === "stalled" && !run.isStalled) return false;
  const start = windowStart(filter.window);
  return !start || run.createdAt >= start;
}

export async function getOperationsPage(
  brandId: string,
  rawFilter: z.input<typeof operationsRunFilterSchema>,
  manuallyQueuedRunIds: string[] = [],
) {
  const filter = operationsRunFilterSchema.parse(rawFilter);
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const all = demoRuns(brandId).map((run) =>
      normalizeOperationsRun(run, {
        latestStage:
          run.status === "failed"
            ? "Failure recorded"
            : run.status === "running"
              ? "Provider request"
              : "Run completed",
        recovery: demoRecovery(run.id, manuallyQueuedRunIds.includes(run.id)),
      }),
    );
    const runs = all.filter((run) => matchesFilter(run, filter)).slice(0, PAGE_SIZE);
    const cost = {
      ...emptyBrandAiCostObservability(brandId, windowStart(filter.window)),
      aiRunCount: all.filter((run) => run.model !== null).length,
      paidRunCount: all.filter((run) => run.costUsd > 0).length,
      inputTokens: all.reduce((sum, run) => sum + run.inputTokens, 0),
      outputTokens: all.reduce((sum, run) => sum + run.outputTokens, 0),
      totalCostUsd: all.reduce((sum, run) => sum + run.costUsd, 0),
    };
    return {
      filter,
      runs,
      nextCursor: null,
      runTypes: [...new Set(all.map((run) => run.runType))].sort(),
      summary: {
        total: all.length,
        inProgress: all.filter((run) => ["queued", "running"].includes(run.status)).length,
        failed: all.filter((run) => run.status === "failed").length,
        stalled: all.filter((run) => run.isStalled).length,
      },
      cost: brandAiCostObservabilitySchema.parse(cost),
    };
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("generation_runs")
    .select(
      "id,brand_id,run_type,entity_type,entity_id,workflow_name,workflow_execution_id,correlation_id,idempotency_key,attempt,status,started_at,completed_at,model_usage,error,created_at",
    )
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (filter.view === "failed") query = query.eq("status", "failed");
  if (filter.view === "stalled") query = query.eq("status", "running");
  if (filter.view === "in_progress") query = query.in("status", ["queued", "running"]);
  if (filter.runType) query = query.eq("run_type", filter.runType);
  const start = windowStart(filter.window);
  if (start) query = query.gte("created_at", start);
  if (filter.cursor) {
    const cursor = decodeOperationsCursor(filter.cursor);
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }
  const { data, error } = await query.limit(PAGE_SIZE + 1);
  if (error) throw new Error("Operations runs could not be loaded.");
  const rawRowCount = data?.length ?? 0;
  const validRows = (data ?? [])
    .map((row) => safeParseOperationsRun(row))
    .filter((row): row is RawOperationsRun => row !== null);
  const pageRows = validRows.slice(0, PAGE_SIZE);
  const runIds = pageRows.map((run) => run.id);
  const [{ data: eventData, error: eventError }, { data: recoveryData, error: recoveryError }] =
    runIds.length
      ? await Promise.all([
          supabase
            .from("pipeline_events")
            .select("generation_run_id,event_type,to_status,created_at")
            .in("generation_run_id", runIds)
            .order("created_at", { ascending: false }),
          supabase
            .from("run_recoveries")
            .select(
              "id,root_generation_run_id,active_generation_run_id,status,category,error_code,retryable,attempt_count,max_attempts,next_retry_at,manual_requested",
            )
            .or(
              `root_generation_run_id.in.(${runIds.join(",")}),active_generation_run_id.in.(${runIds.join(",")})`,
            ),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
  if (eventError) throw new Error("Operations stages could not be loaded.");
  if (recoveryError) throw new Error("Operations recovery state could not be loaded.");
  const latestStageByRun = new Map<string, string>();
  for (const rawEvent of eventData ?? []) {
    const parsedEvent = eventRowSchema.safeParse(rawEvent);
    if (!parsedEvent.success) continue;
    const event = parsedEvent.data;
    if (event.generation_run_id && !latestStageByRun.has(event.generation_run_id)) {
      latestStageByRun.set(
        event.generation_run_id,
        event.to_status ? `${event.event_type} · ${event.to_status}` : event.event_type,
      );
    }
  }
  const recoveryByRun = new Map<string, SafeRunRecovery>();
  for (const rawRecovery of recoveryData ?? []) {
    const parsedRecovery = recoveryRowSchema.safeParse(rawRecovery);
    if (!parsedRecovery.success) continue;
    const recovery = parsedRecovery.data;
    const normalizedRecovery = normalizeRecovery(recovery);
    recoveryByRun.set(recovery.root_generation_run_id, normalizedRecovery);
    recoveryByRun.set(recovery.active_generation_run_id, normalizedRecovery);
  }
  const normalized = pageRows.map((run) =>
    normalizeOperationsRun(run, {
      latestStage: latestStageByRun.get(run.id),
      recovery: recoveryByRun.get(run.id),
      stalledAfterMs: STALLED_AFTER_MS,
    }),
  );
  const runs = normalized.filter((run) => matchesFilter(run, filter));
  const [total, inProgress, failed, stalled, costResult] = await Promise.all([
    supabase
      .from("generation_runs")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brandId),
    supabase
      .from("generation_runs")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brandId)
      .in("status", ["queued", "running"]),
    supabase
      .from("generation_runs")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brandId)
      .eq("status", "failed"),
    supabase
      .from("generation_runs")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brandId)
      .eq("status", "running")
      .lt("started_at", new Date(Date.now() - STALLED_AFTER_MS).toISOString()),
    supabase.rpc("get_brand_ai_cost_observability", {
      p_brand_id: brandId,
      p_since: start,
    }),
  ]);
  if (total.error ?? inProgress.error ?? failed.error ?? stalled.error ?? costResult.error) {
    throw new Error("Operations summary could not be loaded.");
  }
  const last = pageRows.at(-1);
  return {
    filter,
    runs,
    nextCursor:
      rawRowCount > PAGE_SIZE && last
        ? encodeOperationsCursor({ createdAt: last.created_at, id: last.id })
        : null,
    runTypes: [...new Set(normalized.map((run) => run.runType))].sort(),
    summary: {
      total: total.count ?? 0,
      inProgress: inProgress.count ?? 0,
      failed: failed.count ?? 0,
      stalled: stalled.count ?? 0,
    },
    cost: brandAiCostObservabilitySchema.parse(costResult.data),
  };
}
