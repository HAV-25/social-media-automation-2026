import {
  ArrowRight,
  Bot,
  Clock3,
  FileClock,
  MessageSquareText,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cookies } from "next/headers";
import {
  activityEntityHref,
  activityFilterSchema,
  activityLabel,
  type ActivityKind,
} from "@/lib/activity-core";
import { getBrandActivity } from "@/lib/activity";
import { getWorkspaceSnapshot } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const kindStyles: Record<ActivityKind, string> = {
  feedback: "bg-amber-100 text-amber-900",
  human: "bg-blue-100 text-blue-900",
  system: "bg-emerald-100 text-emerald-900",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [cookieStore, rawQuery] = await Promise.all([cookies(), searchParams]);
  const snapshot = await getWorkspaceSnapshot(cookieStore.get("active-brand")?.value);
  const parsedFilter = activityFilterSchema.safeParse({
    view: first(rawQuery.view) ?? "all",
    window: first(rawQuery.window) ?? "7d",
    search: first(rawQuery.search) ?? "",
  });
  const filter = parsedFilter.success
    ? parsedFilter.data
    : activityFilterSchema.parse({ view: "all", window: "7d", search: "" });
  const activity = await getBrandActivity(snapshot.activeBrand.id, filter);

  return (
    <>
      <header className="border-b border-[var(--line)] bg-[var(--canvas)]/90 px-6 py-4 backdrop-blur lg:px-10">
        <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
          {snapshot.activeBrand.name}
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Durable reviewer decisions, feedback and workflow changes
        </p>
      </header>

      <section className="px-6 py-8 lg:px-10 lg:py-10">
        <p className="text-xs font-bold tracking-[0.18em] text-[var(--sage)] uppercase">
          Governance
        </p>
        <h1 className="serif mt-2 text-4xl tracking-[-0.04em] sm:text-5xl">
          Activity &amp; feedback
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Use this history to answer who changed or decided what, when it happened, and why. Runs
          &amp; errors explains technical execution; this screen explains editorial and
          administrative accountability.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-4">
          {(
            [
              ["All activity", activity.totals.all, FileClock],
              ["Reviewer feedback", activity.totals.feedback, MessageSquareText],
              ["Other human actions", activity.totals.human, UserRound],
              ["Workflow actions", activity.totals.system, Bot],
            ] satisfies Array<[string, number, LucideIcon]>
          ).map(([label, value, Icon]) => (
            <article
              key={String(label)}
              className="rounded-2xl border border-[var(--line)] bg-white p-4"
            >
              <Icon size={18} className="text-[var(--sage)]" />
              <strong className="serif mt-3 block text-2xl">{String(value)}</strong>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{String(label)}</p>
            </article>
          ))}
        </div>

        <form className="mt-5 grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-[1fr_180px_180px_auto]">
          <label className="text-xs font-semibold text-[var(--muted)]">
            Search
            <input
              name="search"
              defaultValue={filter.search}
              placeholder="Action, actor, reason or entity"
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--ink)]"
            />
          </label>
          <label className="text-xs font-semibold text-[var(--muted)]">
            Activity type
            <select
              name="view"
              defaultValue={filter.view}
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--ink)]"
            >
              <option value="all">All activity</option>
              <option value="feedback">Reviewer feedback</option>
              <option value="human">Other human actions</option>
              <option value="system">Workflow actions</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--muted)]">
            Time window
            <select
              name="window"
              defaultValue={filter.window}
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--ink)]"
            >
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All retained</option>
            </select>
          </label>
          <button className="self-end rounded-xl bg-[var(--ink)] px-5 py-2.5 text-sm font-bold text-white">
            Apply
          </button>
        </form>

        {activity.limited ? (
          <p className="mt-3 text-xs font-semibold text-amber-800">
            Showing the newest 100 matching records. Narrow the time window to inspect older detail.
          </p>
        ) : null}

        <div className="mt-5 space-y-3">
          {activity.items.map((item) => {
            const href = activityEntityHref(item.entityType, item.entityId);
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-[var(--line)] bg-white p-5"
              >
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase ${kindStyles[item.kind]}`}
                      >
                        {item.kind}
                      </span>
                      <span className="text-xs font-semibold text-[var(--muted)]">
                        {item.actorName}
                      </span>
                    </div>
                    <h2 className="mt-3 text-base font-bold">{activityLabel(item.action)}</h2>
                    {item.reason ? (
                      <blockquote className="mt-3 border-l-2 border-amber-400 pl-3 text-sm leading-6 text-[var(--muted)]">
                        {item.reason}
                      </blockquote>
                    ) : null}
                    <p className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[var(--muted)]">
                      <Clock3 size={11} /> {new Date(item.createdAt).toLocaleString()}
                      <span>·</span>
                      <span>{item.entityType.replaceAll("_", " ")}</span>
                      {item.entityId ? (
                        <span className="font-mono">{item.entityId.slice(0, 8)}</span>
                      ) : null}
                    </p>
                  </div>
                  {href ? (
                    <a
                      href={href}
                      className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-bold"
                    >
                      Inspect <ArrowRight size={14} />
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
          {!activity.items.length ? (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white/50 p-10 text-center">
              <h2 className="serif text-2xl">No activity matches these filters</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Try a wider time window or clear the search term.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
