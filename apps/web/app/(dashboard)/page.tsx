import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  FilePlus2,
  Filter,
  Radio,
  Search,
  Sparkles,
} from "lucide-react";
import { cookies } from "next/headers";
import { OpportunityCard } from "@/components/opportunity-card";
import { getRssDailyDecisions } from "@/lib/rss-daily-decisions";
import { getWorkspaceSnapshot } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const { activeBrand, dashboardMetrics, opportunities } = await getWorkspaceSnapshot(
    cookieStore.get("active-brand")?.value,
  );
  const rssOverview = await getRssDailyDecisions(activeBrand.id, dashboardMetrics.since);
  const today = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(dashboardMetrics.since));
  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

  return (
    <>
      <header className="flex flex-wrap items-center gap-4 border-b border-[var(--line)] bg-[var(--canvas)]/90 px-6 py-4 backdrop-blur lg:px-10">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
            {activeBrand.name}
          </p>
          <p className="text-sm text-[var(--muted)]">Content operations · {today} UTC</p>
        </div>
        <a
          href="/inputs/new"
          className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold"
        >
          <FilePlus2 size={17} /> Add source
        </a>
        <button className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white">
          <Sparkles size={17} /> Create post
        </button>
      </header>

      <section className="px-6 py-8 lg:px-10 lg:py-10">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-[var(--sage)] uppercase">
              Content inbox
            </p>
            <h1 className="serif mt-2 text-4xl tracking-[-0.04em] sm:text-5xl">
              Today’s strongest opportunities
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Sources are normalized, clustered and scored before research spend begins. Nothing
              leaves this desk without human approval.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white p-1">
            <button className="rounded-lg bg-[var(--ink)] px-3 py-2 text-xs font-semibold text-white">
              All
            </button>
            <button className="px-3 py-2 text-xs font-semibold text-[var(--muted)]">
              Priority
            </button>
            <button className="px-3 py-2 text-xs font-semibold text-[var(--muted)]">Review</button>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            [
              String(dashboardMetrics.sourcesToday),
              "Sources today",
              `${dashboardMetrics.normalizedToday} normalized`,
            ],
            [
              String(dashboardMetrics.activeOpportunities),
              "Active opportunities",
              "current brand pipeline",
            ],
            [
              currency.format(dashboardMetrics.researchSpendUsd),
              "Research spend",
              `daily cap ${currency.format(dashboardMetrics.dailyResearchBudgetUsd)}`,
            ],
          ].map(([value, label, note], index) => (
            <div key={label} className="rounded-2xl border border-[var(--line)] bg-white/65 p-5">
              <div className="flex items-start justify-between">
                <span className="serif text-3xl font-bold">{value}</span>
                {index === 2 ? (
                  <CircleDollarSign size={20} className="text-[var(--sage)]" />
                ) : (
                  <span className="mt-1 size-2 rounded-full bg-[var(--accent)]" />
                )}
              </div>
              <p className="mt-3 text-sm font-semibold">{label}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{note}</p>
            </div>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm text-[var(--muted)]">
            <Search size={17} />
            <input
              className="w-full bg-transparent outline-none"
              placeholder="Search sources and topics"
            />
          </label>
          <button className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold">
            <Filter size={16} /> Filters
          </button>
        </div>

        {rssOverview.feeds.length ? (
          <section className="mt-7 rounded-3xl border border-[var(--line)] bg-white/65 p-5 lg:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-[0.16em] text-[var(--sage)] uppercase">
                  Today’s RSS scan
                </p>
                <h2 className="serif mt-1 text-2xl">What each feed contributed</h2>
                <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--muted)]">
                  Every feed is polled, but only brand-relevant items become scored opportunities.
                  Filtered items remain visible here so a missing opportunity is explainable.
                </p>
              </div>
              <a
                href="/sources"
                className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold"
              >
                Manage feeds <ArrowRight size={14} />
              </a>
            </div>
            <div className="mt-5 grid gap-3 xl:grid-cols-3">
              {rssOverview.feeds.map((decision) => (
                <article
                  key={decision.feedId}
                  className="rounded-2xl border border-[var(--line)] bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{decision.feedName}</h3>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">
                        {decision.lastSuccessAt
                          ? `Polled ${new Date(decision.lastSuccessAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`
                          : "Not successfully polled yet"}
                      </p>
                    </div>
                    {decision.lastError ? (
                      <span className="rounded-full bg-red-50 px-2 py-1 text-[9px] font-bold text-red-700">
                        Error
                      </span>
                    ) : (
                      <CheckCircle2 size={17} className="text-emerald-700" />
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-stone-50 p-2">
                      <strong>{decision.itemsSeen}</strong>
                      <p className="text-[9px] text-[var(--muted)] uppercase">New</p>
                    </div>
                    <div className="rounded-xl bg-[var(--sage-soft)] p-2">
                      <strong>{decision.scored}</strong>
                      <p className="text-[9px] text-[var(--sage)] uppercase">Scored</p>
                    </div>
                    <div className="rounded-xl bg-stone-50 p-2">
                      <strong>{decision.filtered}</strong>
                      <p className="text-[9px] text-[var(--muted)] uppercase">Filtered</p>
                    </div>
                  </div>
                  {decision.latestItem ? (
                    <div className="mt-4 border-t border-[var(--line)] pt-3">
                      <p className="line-clamp-2 text-xs font-semibold leading-5">
                        {decision.latestItem.title}
                      </p>
                      <p className="mt-1.5 flex items-center gap-1.5 text-[10px] leading-4 text-[var(--muted)]">
                        <Radio size={11} />
                        {decision.latestItem.explanation}
                        {decision.latestItem.score !== null
                          ? ` · ${decision.latestItem.score.toFixed(0)}/100`
                          : ""}
                      </p>
                      {decision.latestItem.opportunityId ? (
                        <a
                          href={`/opportunities/${decision.latestItem.opportunityId}`}
                          className="mt-2 inline-flex text-xs font-bold text-[var(--sage)]"
                        >
                          Inspect score →
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-4 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]">
                      No new item since 00:00 UTC.
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {rssOverview.items.length ? (
          <section className="mt-5 overflow-hidden rounded-3xl border border-[var(--line)] bg-white/70">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] p-5 lg:p-6">
              <div>
                <p className="text-xs font-bold tracking-[0.16em] text-[var(--sage)] uppercase">
                  Daily opportunity feed
                </p>
                <h2 className="serif mt-1 text-2xl">Every RSS item and its decision</h2>
                <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--muted)]">
                  This includes today’s scored opportunities, brand-filtered articles, duplicates,
                  and items still processing. If a feed has no new article today, its latest known
                  item remains visible for context.
                </p>
              </div>
              <div className="rounded-2xl bg-[var(--sage-soft)] px-4 py-3 text-xs text-[var(--sage)]">
                <strong>{rssOverview.policy.selectedToday}</strong> selected today · automatic{" "}
                <strong>≥ {rssOverview.policy.minimumScore}</strong>
                {rssOverview.policy.minimumScore > rssOverview.policy.reviewMinimumScore ? (
                  <>
                    {" "}
                    · review{" "}
                    <strong>
                      {rssOverview.policy.reviewMinimumScore}–{rssOverview.policy.minimumScore - 1}
                    </strong>
                  </>
                ) : null}{" "}
                · stored only <strong>&lt; {rssOverview.policy.reviewMinimumScore}</strong> · daily
                maximum <strong>{rssOverview.policy.dailyLimit}</strong>
              </div>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {rssOverview.items.map((item) => {
                const selectionLabels = {
                  selected: "Selected for preparation",
                  review: "Review manually",
                  stored_only: "Stored only",
                  below_threshold: "Below score threshold",
                  daily_limit: "Daily maximum reached",
                  ingest_only: "Scoring only",
                  awaiting_selection: "Awaiting selection",
                  not_applicable: item.state.replaceAll("_", " "),
                } as const;
                return (
                  <article
                    key={item.itemId}
                    className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_110px_190px_auto] sm:items-center lg:px-6"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold tracking-wide text-[var(--muted)] uppercase">
                        <span className="text-[var(--sage)]">{item.feedName}</span>
                        <span>·</span>
                        <span>
                          {new Date(item.firstSeenAt).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {!item.inCurrentWindow ? (
                          <>
                            <span>·</span>
                            <span>Latest feed item</span>
                          </>
                        ) : null}
                      </div>
                      <h3 className="mt-1 text-sm font-bold leading-5">{item.title}</h3>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                        {item.explanation}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold tracking-wide text-[var(--muted)] uppercase">
                        Score
                      </p>
                      <p className="serif mt-1 text-xl font-bold">
                        {item.score === null ? "—" : `${item.score.toFixed(0)}/100`}
                      </p>
                    </div>
                    <span
                      className={`w-fit rounded-full px-3 py-1.5 text-[10px] font-bold ${
                        item.selection === "selected"
                          ? "bg-emerald-50 text-emerald-800"
                          : item.selection === "review" ||
                              item.selection === "below_threshold" ||
                              item.selection === "daily_limit"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-stone-100 text-stone-700"
                      }`}
                    >
                      {selectionLabels[item.selection]}
                    </span>
                    {item.opportunityId ? (
                      <a
                        href={`/opportunities/${item.opportunityId}`}
                        className="w-fit rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold"
                      >
                        Review score
                      </a>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">No post candidate</span>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_290px]">
          <div className="space-y-4">
            {opportunities.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} />
            ))}
            {opportunities.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white/50 p-10 text-center">
                <h2 className="serif text-2xl">No opportunities yet</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Add an RSS feed or one-off source to begin the lean scoring pipeline.
                </p>
              </div>
            ) : null}
          </div>

          <aside className="h-fit rounded-2xl bg-[var(--ink)] p-6 text-white xl:sticky xl:top-5">
            <p className="text-[10px] font-bold tracking-[0.18em] text-[#f0b39f] uppercase">
              Editorial pulse
            </p>
            <h2 className="serif mt-3 text-2xl leading-7">Research only what earns attention.</h2>
            <p className="mt-4 text-sm leading-6 text-white/60">
              Live processing totals for {activeBrand.name} since 00:00 UTC. Selected opportunities
              are prepared within the brand&apos;s daily and provider cost limits, then stop for
              human review.
            </p>
            <div className="mt-6 space-y-4 border-t border-white/10 pt-5 text-sm">
              <div className="flex justify-between">
                <span className="text-white/55">Deduplicated</span>
                <strong>{dashboardMetrics.deduplicatedToday}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-white/55">Processing</span>
                <strong>{dashboardMetrics.processingToday}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-white/55">Completed</span>
                <strong>{dashboardMetrics.completedToday}</strong>
              </div>
            </div>
            <a
              href="/sources"
              className="mt-6 flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[var(--ink)]"
            >
              Inspect pipeline <ArrowRight size={17} />
            </a>
          </aside>
        </div>
      </section>
    </>
  );
}
