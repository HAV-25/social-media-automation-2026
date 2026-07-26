import {
  Activity,
  ArrowRight,
  CircleCheck,
  CircleDollarSign,
  CircleX,
  Clock3,
  ImageIcon,
  Radio,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cookies } from "next/headers";
import { costStageLabel, formatRecordedCost } from "@/lib/cost-observability-core";
import {
  feedHealthLabel,
  performanceRunTypeLabel,
  performanceStyleLabel,
  performanceWindowSchema,
  type FeedHealthStatus,
} from "@/lib/performance-core";
import { getBrandPerformanceDashboard } from "@/lib/performance";
import { getWorkspaceSnapshot } from "@/lib/workspace";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formattedTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "No poll recorded";
}

const healthStyles: Record<FeedHealthStatus, string> = {
  healthy: "bg-emerald-100 text-emerald-800",
  stale: "bg-amber-100 text-amber-900",
  failing: "bg-red-100 text-red-800",
  never_polled: "bg-slate-100 text-slate-700",
  paused: "bg-stone-100 text-stone-600",
};

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [cookieStore, query] = await Promise.all([cookies(), searchParams]);
  const snapshot = await getWorkspaceSnapshot(cookieStore.get("active-brand")?.value);
  const parsedWindow = performanceWindowSchema.safeParse(first(query.window) ?? "7d");
  const selectedWindow = parsedWindow.success ? parsedWindow.data : "7d";
  const performance = await getBrandPerformanceDashboard(snapshot.activeBrand.id, selectedWindow);
  const { dashboard, cost } = performance;
  const approvalValue =
    dashboard.decisions.approvalRate === null
      ? "No decisions"
      : `${dashboard.decisions.approvalRate.toFixed(1)}%`;

  return (
    <>
      <header className="border-b border-[var(--line)] bg-[var(--canvas)]/90 px-6 py-4 backdrop-blur lg:px-10">
        <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
          {snapshot.activeBrand.name}
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Editorial operations · {new Date(dashboard.since).toLocaleDateString()} to{" "}
          {new Date(dashboard.until).toLocaleDateString()}
        </p>
      </header>

      <section className="px-6 py-8 lg:px-10 lg:py-10">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-[var(--sage)] uppercase">
              Business performance
            </p>
            <h1 className="serif mt-2 text-4xl tracking-[-0.04em] sm:text-5xl">
              What the content engine delivered
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              Monitor source reliability, preparation volume, reviewer outcomes, and recorded AI
              cost for the selected brand. Runs &amp; errors remains the technical diagnosis view.
            </p>
          </div>
          <form className="flex items-end gap-2 rounded-2xl border border-[var(--line)] bg-white p-3">
            <label className="text-xs font-semibold text-[var(--muted)]">
              Reporting window
              <select
                name="window"
                defaultValue={performance.window}
                className="mt-1.5 block rounded-xl border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
              >
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </label>
            <button className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm font-bold text-white">
              Apply
            </button>
          </form>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            {
              label: "Recorded AI cost",
              value: formatRecordedCost(cost.totalCostUsd),
              note: `${cost.paidRunCount} paid calls`,
              icon: CircleDollarSign,
            },
            {
              label: "Healthy feeds",
              value: `${dashboard.feedHealth.healthyCount}/${dashboard.feedHealth.activeCount}`,
              note: `${dashboard.feedHealth.attentionCount} need attention`,
              icon: Radio,
            },
            {
              label: "Approval rate",
              value: approvalValue,
              note: "approved ÷ decided",
              icon: CircleCheck,
            },
            {
              label: "Prepared drafts",
              value: String(dashboard.generationVolume.reviewReadyCount),
              note: `${dashboard.generationVolume.opportunityCount} opportunities`,
              icon: Sparkles,
            },
            {
              label: "Awaiting review",
              value: String(dashboard.decisions.pendingReviewCount),
              note: "current review queue",
              icon: Clock3,
            },
          ].map(({ label, value, note, icon: Icon }) => (
            <article key={label} className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <Icon size={18} className="text-[var(--sage)]" />
              <strong className="serif mt-3 block text-2xl">{value}</strong>
              <p className="mt-1 text-xs font-bold">{label}</p>
              <p className="mt-1 text-[10px] text-[var(--muted)]">{note}</p>
            </article>
          ))}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
          <section className="rounded-3xl border border-[var(--line)] bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
                  Feed health
                </p>
                <h2 className="serif mt-2 text-3xl">Are sources arriving reliably?</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                  An active feed is healthy when it has no consecutive failures and was polled
                  within 30 minutes—twice the configured 15-minute intake interval.
                </p>
              </div>
              <a
                href="/sources"
                className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-bold"
              >
                Manage feeds <ArrowRight size={14} />
              </a>
            </div>
            <div className="mt-5 divide-y divide-[var(--line)]">
              {dashboard.feedHealth.feeds.map((feed) => (
                <article
                  key={feed.id}
                  className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div>
                    <p className="font-bold">{feed.name}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Last poll: {formattedTime(feed.lastPolledAt)}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${healthStyles[feed.status]}`}
                    >
                      {feedHealthLabel(feed.status)}
                    </span>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">
                      {feed.consecutiveFailures} consecutive failures
                    </p>
                  </div>
                </article>
              ))}
              {!dashboard.feedHealth.feeds.length ? (
                <p className="py-8 text-center text-sm text-[var(--muted)]">
                  No feeds are routed to this brand.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--line)] bg-white p-5">
            <p className="text-[10px] font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
              Reviewer outcomes
            </p>
            <h2 className="serif mt-2 text-3xl">What reviewers decided</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Approval rate excludes change requests: approved posts divided by approved plus
              rejected posts in this window.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {(
                [
                  ["Approved", dashboard.decisions.approvedCount, CircleCheck],
                  ["Rejected", dashboard.decisions.rejectedCount, CircleX],
                  ["Changes", dashboard.decisions.changesRequestedCount, Activity],
                ] satisfies Array<[string, number, LucideIcon]>
              ).map(([label, value, Icon]) => (
                <div key={String(label)} className="rounded-2xl bg-[var(--soft)] p-3">
                  <Icon size={16} className="text-[var(--sage)]" />
                  <strong className="serif mt-2 block text-xl">{String(value)}</strong>
                  <span className="text-[10px] font-bold text-[var(--muted)]">{String(label)}</span>
                </div>
              ))}
            </div>
            <h3 className="mt-6 text-xs font-bold tracking-wide uppercase">Rejection reasons</h3>
            <div className="mt-3 space-y-2">
              {dashboard.decisions.rejectionReasons.map((reason) => (
                <div
                  key={reason.reason}
                  className="flex gap-3 rounded-xl border border-[var(--line)] p-3"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-red-50 text-xs font-bold text-red-800">
                    {reason.count}
                  </span>
                  <p className="text-xs leading-5 text-[var(--muted)]">{reason.reason}</p>
                </div>
              ))}
              {!dashboard.decisions.rejectionReasons.length ? (
                <p className="rounded-xl bg-[var(--soft)] p-4 text-xs text-[var(--muted)]">
                  No rejection reason was recorded in this window.
                </p>
              ) : null}
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="rounded-3xl border border-[var(--line)] bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
                  Generation volume
                </p>
                <h2 className="serif mt-2 text-3xl">What was prepared</h2>
              </div>
              <ImageIcon size={20} className="text-[var(--sage)]" />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                ["Draft variants", dashboard.generationVolume.draftCount],
                ["Review-ready", dashboard.generationVolume.reviewReadyCount],
                ["Images ready", dashboard.generationVolume.imageReadyCount],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl bg-[var(--soft)] p-4">
                  <strong className="serif text-2xl">{String(value)}</strong>
                  <p className="mt-1 text-[10px] font-bold text-[var(--muted)]">{String(label)}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-3">
              {dashboard.generationVolume.byStyle.map((style) => (
                <div key={style.style} className="flex items-center justify-between text-sm">
                  <span>{performanceStyleLabel(style.style)}</span>
                  <strong>{style.count}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--line)] bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
                  AI usage and cost
                </p>
                <h2 className="serif mt-2 text-3xl">Where credits were used</h2>
              </div>
              <a
                href={`/runs?window=${performance.window}`}
                className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-bold"
              >
                Exact cost ledger <ArrowRight size={14} />
              </a>
            </div>
            <div className="mt-5 space-y-3">
              {cost.byStage.map((stage) => (
                <div key={stage.key} className="rounded-2xl border border-[var(--line)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold">{costStageLabel(stage.key)}</p>
                    <strong>{formatRecordedCost(stage.costUsd)}</strong>
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                    {stage.runCount} steps · {stage.inputTokens.toLocaleString()} input ·{" "}
                    {stage.outputTokens.toLocaleString()} output tokens
                  </p>
                </div>
              ))}
              {!cost.byStage.length ? (
                <p className="rounded-xl bg-[var(--soft)] p-4 text-xs text-[var(--muted)]">
                  No AI usage was recorded in this window.
                </p>
              ) : null}
            </div>
            <h3 className="mt-6 text-xs font-bold tracking-wide uppercase">
              Successful workflow stages
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {dashboard.generationVolume.successfulRunsByType.map((run) => (
                <div
                  key={run.runType}
                  className="flex justify-between rounded-xl bg-[var(--soft)] p-3"
                >
                  <span className="text-xs">{performanceRunTypeLabel(run.runType)}</span>
                  <strong className="text-xs">{run.count}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </>
  );
}
