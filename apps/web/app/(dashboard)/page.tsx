import { ArrowRight, CircleDollarSign, FilePlus2, Filter, Search, Sparkles } from "lucide-react";
import { cookies } from "next/headers";
import { OpportunityCard } from "@/components/opportunity-card";
import { getWorkspaceSnapshot } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const { activeBrand, opportunities } = await getWorkspaceSnapshot(
    cookieStore.get("active-brand")?.value,
  );

  return (
    <>
      <header className="flex flex-wrap items-center gap-4 border-b border-[var(--line)] bg-[var(--canvas)]/90 px-6 py-4 backdrop-blur lg:px-10">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
            {activeBrand.name}
          </p>
          <p className="text-sm text-[var(--muted)]">Content operations · Thursday, 23 July</p>
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
            ["14", "Sources today", "8 normalized"],
            ["3", "Strong opportunities", "score ≥ 72"],
            ["$0.84", "Research spend", "daily cap $10"],
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
              The lean pipeline has held 11 duplicate, low-value or recently covered items before
              costly research and image generation.
            </p>
            <div className="mt-6 space-y-4 border-t border-white/10 pt-5 text-sm">
              <div className="flex justify-between">
                <span className="text-white/55">Deduplicated</span>
                <strong>6</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-white/55">Below threshold</span>
                <strong>4</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-white/55">Recently covered</span>
                <strong>1</strong>
              </div>
            </div>
            <button className="mt-6 flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[var(--ink)]">
              Inspect pipeline <ArrowRight size={17} />
            </button>
          </aside>
        </div>
      </section>
    </>
  );
}
