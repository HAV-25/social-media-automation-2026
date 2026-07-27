import { Archive, ArrowRight, Clock3, RotateCcw } from "lucide-react";
import { cookies } from "next/headers";
import { rollingWindowStart } from "@/lib/brand-archive-policy-core";
import { getRssArchive } from "@/lib/rss-archive";
import { getWorkspaceSnapshot } from "@/lib/workspace";
import { resurfaceRssItem } from "./actions";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function actionSummary(postStatuses: string[], opportunityStatus: string | null) {
  if (postStatuses.includes("approved")) return "Post approved";
  if (postStatuses.includes("rejected")) return "Post rejected";
  if (postStatuses.includes("ready_for_review")) return "Draft prepared for review";
  if (postStatuses.length) return `Draft ${postStatuses[0]?.replaceAll("_", " ")}`;
  if (opportunityStatus) return `Opportunity ${opportunityStatus.replaceAll("_", " ")}`;
  return "Stored without a post candidate";
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [cookieStore, query] = await Promise.all([cookies(), searchParams]);
  const snapshot = await getWorkspaceSnapshot(cookieStore.get("active-brand")?.value);
  const items = await getRssArchive(
    snapshot.activeBrand.id,
    snapshot.rssWindowSince,
    rollingWindowStart(new Date(), snapshot.archivePolicy.resurfaceWindowHours),
  );

  return (
    <>
      <header className="border-b border-[var(--line)] bg-[var(--canvas)]/90 px-6 py-4 backdrop-blur lg:px-10">
        <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
          {snapshot.activeBrand.name}
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Historical RSS decisions · preserved for review and reuse
        </p>
      </header>
      <section className="px-6 py-8 lg:px-10 lg:py-10">
        {first(query.error) ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {first(query.error)}
          </div>
        ) : null}
        <div className="max-w-4xl">
          <p className="text-xs font-bold tracking-[0.18em] text-[var(--sage)] uppercase">
            Editorial history
          </p>
          <h1 className="serif mt-2 text-4xl tracking-[-0.04em] sm:text-5xl">Article archive</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            RSS articles leave the active inbox after {snapshot.archivePolicy.inboxWindowHours}{" "}
            hours without being deleted. Their score, editorial outcome and audit history remain
            available. Resurfacing returns a scored article to the active review window for{" "}
            {snapshot.archivePolicy.resurfaceWindowHours} hours; it does not bypass research,
            verification or human approval.
          </p>
        </div>

        <div className="mt-8 flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white/70 p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[var(--sage-soft)] text-[var(--sage)]">
              <Archive size={19} />
            </span>
            <div>
              <p className="text-sm font-bold">{items.length} archived articles shown</p>
              <p className="text-xs text-[var(--muted)]">Newest archived article first</p>
            </div>
          </div>
          <a
            href="/archive"
            aria-label="Reload archive"
            className="rounded-xl border border-[var(--line)] bg-white p-2.5 text-[var(--muted)]"
          >
            <RotateCcw size={16} />
          </a>
        </div>

        <div className="mt-5 space-y-3">
          {items.map((item) => (
            <article
              key={item.itemId}
              className="rounded-2xl border border-[var(--line)] bg-white p-5 paper-shadow"
            >
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold tracking-wide text-[var(--muted)] uppercase">
                    <span className="text-[var(--sage)]">{item.feedName}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock3 size={11} />
                      {new Date(item.firstSeenAt).toLocaleString()}
                    </span>
                  </div>
                  <h2 className="mt-2 text-base font-bold leading-6">{item.title}</h2>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Automatically archived after its {snapshot.archivePolicy.inboxWindowHours}-hour
                    active window · {actionSummary(item.postStatuses, item.opportunityStatus)}
                  </p>
                  {item.lastResurfacedAt ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Last resurfaced {new Date(item.lastResurfacedAt).toLocaleString()}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-20">
                  <p className="text-[9px] font-bold tracking-wide text-[var(--muted)] uppercase">
                    Score
                  </p>
                  <p className="serif mt-1 text-2xl font-bold">
                    {item.score === null ? "—" : item.score.toFixed(0)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.opportunityId ? (
                    <>
                      <a
                        href={`/opportunities/${item.opportunityId}`}
                        className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold"
                      >
                        Inspect <ArrowRight size={14} />
                      </a>
                      <form action={resurfaceRssItem}>
                        <input type="hidden" name="brandId" value={snapshot.activeBrand.id} />
                        <input type="hidden" name="itemId" value={item.itemId} />
                        <input type="hidden" name="opportunityId" value={item.opportunityId} />
                        <button className="rounded-xl bg-[var(--ink)] px-3 py-2 text-xs font-bold text-white">
                          Resurface for review
                        </button>
                      </form>
                    </>
                  ) : (
                    <span className="rounded-xl bg-stone-100 px-3 py-2 text-xs text-[var(--muted)]">
                      No scored opportunity
                    </span>
                  )}
                </div>
              </div>
            </article>
          ))}
          {!items.length ? (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white/50 p-10 text-center">
              <h2 className="serif text-2xl">No archived RSS articles</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Articles will appear here automatically after their rolling{" "}
                {snapshot.archivePolicy.inboxWindowHours}-hour inbox window.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
