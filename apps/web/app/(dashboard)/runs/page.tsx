import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CircleCheck,
  Clock3,
  Coins,
  Filter,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { cookies } from "next/headers";
import { operationsRunFilterSchema } from "@content-engine/contracts";
import { getCurrentUser } from "@/lib/auth";
import {
  costSourceTypeLabel,
  costStageLabel,
  emptyBrandAiCostObservability,
  formatRecordedCost,
} from "@/lib/cost-observability-core";
import { parseDemoRecoveredRuns } from "@/lib/demo-recovery-store";
import { getOperationsPage } from "@/lib/operations";
import { getWorkspaceSnapshot } from "@/lib/workspace";
import { RssRunTrigger } from "@/components/rss-run-trigger";
import { requestManualRecovery } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function duration(value: number | null) {
  if (value === null) return "Not started";
  if (value < 1_000) return `${value} ms`;
  const seconds = Math.round(value / 1_000);
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function nextPageHref(filter: ReturnType<typeof operationsRunFilterSchema.parse>, cursor: string) {
  const query = new URLSearchParams({
    view: filter.view,
    window: filter.window,
    cursor,
  });
  if (filter.runType) query.set("runType", filter.runType);
  return `/runs?${query}`;
}

const statusStyle = {
  queued: "bg-slate-100 text-slate-700",
  running: "bg-blue-50 text-blue-700",
  succeeded: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  cancelled: "bg-stone-100 text-stone-600",
} as const;

export default async function RunsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, cookieStore, user] = await Promise.all([
    searchParams,
    cookies(),
    getCurrentUser(),
  ]);
  const snapshot = await getWorkspaceSnapshot(cookieStore.get("active-brand")?.value);
  const filter = operationsRunFilterSchema.parse({
    view: first(params.view),
    runType: first(params.runType) || undefined,
    window: first(params.window),
    cursor: first(params.cursor) || undefined,
  });
  let operationsLoadFailed = false;
  const operations = await getOperationsPage(
    snapshot.activeBrand.id,
    filter,
    parseDemoRecoveredRuns(cookieStore.get("demo-recovered-runs")?.value),
  ).catch(() => {
    operationsLoadFailed = true;
    return {
      filter,
      runs: [],
      nextCursor: null,
      runTypes: [],
      summary: {
        total: 0,
        inProgress: 0,
        failed: 0,
        stalled: 0,
      },
      cost: emptyBrandAiCostObservability(snapshot.activeBrand.id, null),
    };
  });
  const isOrganizationAdministrator = user?.organizationRole === "administrator";
  const summaryCards = [
    { label: "All runs", value: operations.summary.total, Icon: Activity },
    { label: "In progress", value: operations.summary.inProgress, Icon: Clock3 },
    { label: "Failed", value: operations.summary.failed, Icon: AlertTriangle },
    { label: "Stalled", value: operations.summary.stalled, Icon: ShieldAlert },
    {
      label: "AI cost · selected window",
      value: formatRecordedCost(operations.cost.totalCostUsd),
      Icon: Coins,
    },
  ];

  return (
    <>
      <header className="border-b border-[var(--line)] bg-[var(--canvas)]/90 px-6 py-4 backdrop-blur lg:px-10">
        <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
          {snapshot.activeBrand.name}
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Durable pipeline state from Supabase · source content and raw provider errors are redacted
        </p>
      </header>

      <section className="px-6 py-8 lg:px-10 lg:py-10">
        {operationsLoadFailed ? (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            Run history is temporarily unavailable. The rest of this operations screen remains
            usable; reload to retry the durable history query.
          </div>
        ) : null}
        {first(params.recovery) === "queued" ? (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            Recovery queued. WF-10 will claim it on the next bounded dispatch poll.
          </div>
        ) : null}
        {first(params.error) ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {first(params.error)}
          </div>
        ) : null}
        <div className="max-w-4xl">
          <p className="text-xs font-bold tracking-[0.18em] text-[var(--sage)] uppercase">
            Operations
          </p>
          <h1 className="serif mt-2 text-4xl tracking-[-0.04em] sm:text-5xl">Runs &amp; errors</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Inspect workflow stage, duration, attempts, bounded model usage, cost and safely
            classified failures. This view remains available when n8n or a provider is unavailable.
          </p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map(({ label, value, Icon }) => (
            <div key={label} className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="serif text-2xl font-bold">{String(value)}</span>
                <Icon size={18} className="text-[var(--sage)]" />
              </div>
              <p className="mt-2 text-xs font-semibold text-[var(--muted)]">{label}</p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <RssRunTrigger brandId={snapshot.activeBrand.id} brandName={snapshot.activeBrand.name} />
        </div>

        <form
          method="get"
          className="mt-6 grid gap-3 rounded-2xl border border-[var(--line)] bg-white/70 p-4 md:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <label className="text-xs font-semibold text-[var(--muted)]">
            Run state
            <select
              name="view"
              defaultValue={operations.filter.view}
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink)]"
            >
              <option value="all">All runs</option>
              <option value="in_progress">In progress</option>
              <option value="failed">Failed</option>
              <option value="stalled">Stalled</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--muted)]">
            Run type
            <select
              name="runType"
              defaultValue={operations.filter.runType ?? ""}
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink)]"
            >
              <option value="">All types</option>
              {operations.runTypes.map((runType) => (
                <option key={runType} value={runType}>
                  {runType.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--muted)]">
            Time window
            <select
              name="window"
              defaultValue={operations.filter.window}
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink)]"
            >
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All retained runs</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button className="flex items-center gap-2 rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-semibold text-white">
              <Filter size={15} /> Apply
            </button>
            <a
              href="/runs"
              aria-label="Reset run filters"
              className="rounded-xl border border-[var(--line)] bg-white p-2.5 text-[var(--muted)]"
            >
              <RotateCcw size={16} />
            </a>
          </div>
        </form>

        <section className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--ink)] p-5 text-white paper-shadow sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-[10px] font-bold tracking-[0.18em] text-emerald-200 uppercase">
                Exact cost ledger
              </p>
              <h2 className="serif mt-2 text-3xl">What AI work cost this brand</h2>
              <p className="mt-2 text-sm leading-6 text-white/65">
                These totals cover every recorded AI step in the selected time window—not only the
                runs visible on this page. Zero-cost mocks and deterministic steps never inflate
                spend.
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-4 text-right">
              <p className="text-[10px] font-bold tracking-wide text-white/55 uppercase">
                Recorded total
              </p>
              <p className="serif mt-1 text-3xl font-bold">
                {formatRecordedCost(operations.cost.totalCostUsd)}
              </p>
              <p className="mt-1 text-xs text-white/55">
                {operations.cost.paidRunCount} paid calls · {operations.cost.aiRunCount} ledgered
                steps
              </p>
            </div>
          </div>

          <dl className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Input tokens",
                value: operations.cost.inputTokens.toLocaleString(),
              },
              {
                label: "Output tokens",
                value: operations.cost.outputTokens.toLocaleString(),
              },
              {
                label: "Web searches",
                value: operations.cost.webSearchCalls.toLocaleString(),
              },
              {
                label: "Generated images",
                value: operations.cost.generatedImages.toLocaleString(),
              },
            ].map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <dt className="text-[10px] font-bold tracking-wide text-white/50 uppercase">
                  {metric.label}
                </dt>
                <dd className="mt-1 text-xl font-bold">{metric.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            <CostBreakdown
              title="By workflow step"
              rows={operations.cost.byStage.map((row) => ({
                key: row.key,
                label: costStageLabel(row.key),
                costUsd: row.costUsd,
                runCount: row.runCount,
              }))}
            />
            <CostBreakdown
              title="By model"
              rows={operations.cost.byModel.map((row) => ({
                key: row.key,
                label: row.key,
                costUsd: row.costUsd,
                runCount: row.runCount,
              }))}
            />
            <CostBreakdown
              title="By source input"
              rows={operations.cost.bySourceType.map((row) => ({
                key: row.key,
                label: costSourceTypeLabel(row.key),
                costUsd: row.costUsd,
                runCount: row.runCount,
              }))}
            />
          </div>

          <details className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <summary className="cursor-pointer text-sm font-bold">
              Inspect costs by content package ({operations.cost.byPackage.length})
            </summary>
            <div className="mt-4 divide-y divide-white/10">
              {operations.cost.byPackage.map((item) => (
                <div
                  key={item.opportunityId}
                  className="grid gap-2 py-3 text-sm md:grid-cols-[minmax(0,1fr)_auto_auto]"
                >
                  <div className="min-w-0">
                    <a
                      href={`/opportunities/${item.opportunityId}`}
                      className="font-semibold text-white underline decoration-white/25 underline-offset-4"
                    >
                      {item.sourceTitle}
                    </a>
                    <p className="mt-1 text-xs text-white/50">
                      {costSourceTypeLabel(item.sourceType)} · {item.runCount} AI-related steps
                    </p>
                  </div>
                  <p className="text-xs text-white/60 md:text-right">
                    {item.draftCount} drafts · {item.reviewReadyCount} review-ready ·{" "}
                    {item.approvedCount} approved
                  </p>
                  <p className="font-bold md:min-w-24 md:text-right">
                    {formatRecordedCost(item.costUsd)}
                  </p>
                </div>
              ))}
              {operations.cost.byPackage.length === 0 ? (
                <p className="py-4 text-sm text-white/55">
                  No AI-backed content package was recorded in this window.
                </p>
              ) : null}
            </div>
          </details>
        </section>

        <div className="mt-5 space-y-3">
          {operations.runs.map((run) => (
            <article
              key={run.id}
              className={`rounded-2xl border bg-white p-5 paper-shadow ${
                run.isStalled ? "border-amber-300" : "border-[var(--line)]"
              }`}
            >
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase ${statusStyle[run.status]}`}
                    >
                      {run.isStalled ? "stalled" : run.status}
                    </span>
                    <span className="text-xs font-semibold text-[var(--sage)]">
                      Attempt {run.attempt}
                    </span>
                    {run.error ? (
                      <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-bold tracking-wide text-stone-700 uppercase">
                        {run.error.category}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-3 text-base font-bold">{run.workflowName}</h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {run.runType.replaceAll("_", " ")} · {run.entityType.replaceAll("_", " ")}
                  </p>
                </div>
                <div className="text-right text-xs text-[var(--muted)]">
                  <p>{dateTime(run.createdAt)}</p>
                  <p className="mt-1 font-semibold text-[var(--ink)]">{duration(run.durationMs)}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-3">
                <div>
                  <p className="text-[10px] font-bold tracking-wide text-[var(--muted)] uppercase">
                    Current stage
                  </p>
                  <p className="mt-1 text-sm">{run.latestStage}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold tracking-wide text-[var(--muted)] uppercase">
                    Model
                  </p>
                  <p className="mt-1 text-sm">{run.model ?? "Deterministic / none"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold tracking-wide text-[var(--muted)] uppercase">
                    Recorded cost
                  </p>
                  <p className="mt-1 text-sm font-semibold">${run.costUsd.toFixed(4)}</p>
                </div>
              </div>

              {run.error ? (
                <div className="mt-4 rounded-xl border border-red-100 bg-red-50/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
                    <AlertTriangle size={16} /> {run.error.code}
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-red-800/75">{run.error.message}</p>
                  <p className="mt-2 text-[10px] font-bold tracking-wide text-red-700 uppercase">
                    {run.error.retryable
                      ? "Eligible for bounded recovery policy"
                      : "Permanent until an administrator intervenes"}
                  </p>
                </div>
              ) : run.status === "succeeded" ? (
                <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <CircleCheck size={15} /> Completed without a recorded error
                </div>
              ) : null}

              {run.recovery ? (
                <div className="mt-4 rounded-xl border border-[var(--line)] bg-stone-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold tracking-wide text-[var(--muted)] uppercase">
                        Recovery state
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {run.recovery.status.replaceAll("_", " ")} · attempt{" "}
                        {run.recovery.attemptCount}/{run.recovery.maxAttempts}
                      </p>
                      {run.recovery.nextRetryAt ? (
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          Next bounded retry {dateTime(run.recovery.nextRetryAt)}
                        </p>
                      ) : null}
                    </div>
                    {run.recovery.status === "dead_letter" ? (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-[10px] font-bold tracking-wide text-red-800 uppercase">
                        Administrator attention
                      </span>
                    ) : null}
                  </div>

                  {isOrganizationAdministrator &&
                  (run.status === "failed" || run.isStalled) &&
                  !["completed", "recovered", "cancelled"].includes(run.recovery.status) ? (
                    <form
                      action={requestManualRecovery}
                      className="mt-4 grid gap-2 border-t border-[var(--line)] pt-4 sm:grid-cols-[1fr_auto]"
                    >
                      <input type="hidden" name="generationRunId" value={run.id} />
                      <label className="text-xs font-semibold text-[var(--muted)]">
                        Administrator recovery reason
                        <input
                          name="reason"
                          required
                          minLength={10}
                          maxLength={1000}
                          defaultValue={
                            run.isStalled
                              ? "Retry this stalled execution after reviewing its current stage."
                              : "Retry this failed execution after reviewing its classified error."
                          }
                          className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink)]"
                        />
                      </label>
                      <button className="self-end rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-semibold text-white">
                        Queue manual recovery
                      </button>
                    </form>
                  ) : null}
                </div>
              ) : run.status === "failed" || run.isStalled ? (
                <p className="mt-4 text-xs font-semibold text-amber-800">
                  This historical run predates replayable execution registration.
                </p>
              ) : null}

              <details className="mt-4 border-t border-[var(--line)] pt-3">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--sage)]">
                  Inspect provenance
                </summary>
                <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <dt className="text-[var(--muted)]">Correlation</dt>
                    <dd className="mt-1 break-all font-mono">{run.correlationId}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Entity</dt>
                    <dd className="mt-1 break-all font-mono">{run.entityId}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Tokens</dt>
                    <dd className="mt-1">
                      {run.inputTokens.toLocaleString()} in · {run.outputTokens.toLocaleString()}{" "}
                      out
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Prompt / execution</dt>
                    <dd className="mt-1 break-all">
                      {run.promptVersion ?? "No prompt"} ·{" "}
                      {run.workflowExecutionId ?? "Application"}
                    </dd>
                  </div>
                </dl>
              </details>
            </article>
          ))}

          {operations.runs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white/50 p-10 text-center">
              <h2 className="serif text-2xl">No matching runs</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                This brand has no durable runs matching the selected state, type and time window.
              </p>
            </div>
          ) : null}
        </div>

        {operations.nextCursor ? (
          <a
            href={nextPageHref(operations.filter, operations.nextCursor)}
            className="mt-5 flex w-fit items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold"
          >
            Older runs <ArrowRight size={16} />
          </a>
        ) : null}
      </section>
    </>
  );
}

function CostBreakdown({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; label: string; costUsd: number; runCount: number }>;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <h3 className="text-xs font-bold tracking-wide text-white/55 uppercase">{title}</h3>
      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{row.label}</p>
              <p className="mt-0.5 text-[11px] text-white/45">
                {row.runCount} {row.runCount === 1 ? "run" : "runs"}
              </p>
            </div>
            <p className="shrink-0 text-sm font-bold">{formatRecordedCost(row.costUsd)}</p>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-white/45">No recorded AI usage.</p> : null}
      </div>
    </div>
  );
}
