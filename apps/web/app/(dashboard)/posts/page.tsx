import { ArrowRight, CheckCircle2, FileClock, Layers, Sparkles } from "lucide-react";
import { cookies } from "next/headers";
import { parseReadyPostFilters, type ReadyPostStatus } from "@/lib/ready-post-filters";
import { groupReadyPosts } from "@/lib/ready-post-grouping";
import { getReadyPosts } from "@/lib/ready-posts";
import { getWorkspaceSnapshot } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const statusBadge: Record<ReadyPostStatus, { label: string; className: string }> = {
  ready_for_review: {
    label: "Needs review",
    className: "bg-[var(--sage-soft)] text-[var(--sage)]",
  },
  changes_requested: { label: "Changes requested", className: "bg-amber-100 text-amber-700" },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", className: "bg-rose-100 text-rose-700" },
};

export default async function ReadyPostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const { activeBrand } = await getWorkspaceSnapshot(cookieStore.get("active-brand")?.value);
  const filters = parseReadyPostFilters(await searchParams);
  const posts = await getReadyPosts(activeBrand.id, filters);
  const groups = groupReadyPosts(posts);

  return (
    <>
      <header className="border-b border-[var(--line)] bg-[var(--canvas)]/90 px-6 py-5 backdrop-blur lg:px-10">
        <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
          {activeBrand.name} · Review queue
        </p>
        <h1 className="serif mt-1 text-4xl tracking-[-0.04em]">Ready posts</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Drafts that completed generation and verification, grouped by topic with each angle ranked
          by quality. Approved and rejected angles stay visible, tagged with their status.
        </p>
      </header>

      <section className="px-6 py-8 lg:px-10 lg:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <CheckCircle2 size={17} className="text-[var(--sage)]" />
            <strong className="text-[var(--ink)]">{groups.length}</strong> topic
            {groups.length === 1 ? "" : "s"} ·
            <strong className="text-[var(--ink)]">{posts.length}</strong> angle
            {posts.length === 1 ? "" : "s"} match the current filters
          </div>
          <a href="/posts" className="text-xs font-bold text-[var(--sage)]">
            Reset filters
          </a>
        </div>

        <form
          method="get"
          className="mb-6 grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-2 xl:grid-cols-6"
        >
          <label className="text-xs font-bold text-[var(--muted)]">
            Date
            <select
              name="window"
              defaultValue={filters.window}
              className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="all">Any time</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </label>
          <label className="text-xs font-bold text-[var(--muted)]">
            Editorial state
            <select
              name="status"
              defaultValue={filters.status}
              className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="all">All states</option>
              <option value="ready_for_review">Needs review</option>
              <option value="changes_requested">Changes requested</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label className="text-xs font-bold text-[var(--muted)]">
            Style
            <select
              name="style"
              defaultValue={filters.style}
              className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="all">All styles</option>
              <option value="newsworthy_authority">Newsworthy</option>
              <option value="educational_breakdown">Educational</option>
              <option value="perspective_conversation">Perspective</option>
            </select>
          </label>
          <label className="text-xs font-bold text-[var(--muted)]">
            Tone
            <select
              name="tone"
              defaultValue={filters.tone}
              className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="all">All tones</option>
              <option value="authoritative">Authoritative</option>
              <option value="conversational">Conversational</option>
              <option value="bold">Bold</option>
              <option value="thoughtful">Thoughtful</option>
              <option value="witty">Witty</option>
            </select>
          </label>
          <label className="text-xs font-bold text-[var(--muted)]">
            Sort
            <select
              name="sort"
              defaultValue={filters.sort}
              className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="updated_desc">Newest updated</option>
              <option value="updated_asc">Oldest updated</option>
              <option value="quality_desc">Quality: high to low</option>
              <option value="quality_asc">Quality: low to high</option>
            </select>
          </label>
          <button
            type="submit"
            className="self-end rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-bold text-white"
          >
            Apply filters
          </button>
        </form>

        <div className="space-y-6">
          {groups.map((group) => (
            <section
              key={group.opportunityId}
              className="overflow-hidden rounded-3xl border border-[var(--line)] bg-white paper-shadow"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] bg-stone-50/60 px-6 py-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-[var(--accent)] uppercase">
                    <Layers size={13} /> Topic
                  </p>
                  <h2 className="serif mt-1 text-2xl leading-7">{group.sourceTitle}</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold tracking-[0.1em] uppercase">
                  <span className="rounded-full bg-white px-2.5 py-1 text-[var(--muted)] ring-1 ring-[var(--line)]">
                    {group.posts.length} angle{group.posts.length === 1 ? "" : "s"}
                  </span>
                  {group.pendingCount > 0 ? (
                    <span className="rounded-full bg-[var(--sage-soft)] px-2.5 py-1 text-[var(--sage)]">
                      {group.pendingCount} awaiting review
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">
                      All decided
                    </span>
                  )}
                </div>
              </div>

              <div className="divide-y divide-[var(--line)]">
                {group.posts.map((post, index) => (
                  <article
                    key={post.id}
                    className="flex flex-wrap items-start justify-between gap-4 px-6 py-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold tracking-[0.12em] uppercase">
                        {index === 0 ? (
                          <span className="rounded-full bg-[var(--ink)] px-2 py-1 text-white">
                            Top angle
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full px-2.5 py-1 ${statusBadge[post.status].className}`}
                        >
                          {statusBadge[post.status].label}
                        </span>
                        <span className="text-[var(--muted)]">
                          {post.contentStyle.replaceAll("_", " ")} · {post.tone}
                        </span>
                      </div>
                      <h3 className="serif mt-2 text-xl leading-7">{post.hook}</h3>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
                        {post.excerpt}
                        {post.excerpt.length === 220 ? "…" : ""}
                      </p>
                      <span className="mt-3 flex items-center gap-1.5 text-xs text-[var(--muted)]">
                        <FileClock size={13} />
                        Updated {new Date(post.updatedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="rounded-xl bg-stone-50 px-3 py-2">
                          <p className="text-[9px] font-bold text-[var(--muted)] uppercase">
                            Quality
                          </p>
                          <strong className="serif mt-0.5 block text-lg">
                            {post.qualityScore?.toFixed(0) ?? "—"}
                          </strong>
                        </div>
                        <div className="rounded-xl bg-stone-50 px-3 py-2">
                          <p className="text-[9px] font-bold text-[var(--muted)] uppercase">
                            Version
                          </p>
                          <strong className="serif mt-0.5 block text-lg">
                            {post.versionNumber}
                          </strong>
                        </div>
                      </div>
                      <a
                        href={`/posts/${post.id}`}
                        className="flex items-center gap-2 rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-bold text-white"
                      >
                        Review <ArrowRight size={15} />
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}

          {groups.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--line)] bg-white/50 p-12 text-center">
              <Sparkles className="mx-auto text-[var(--sage)]" size={24} />
              <h2 className="serif mt-4 text-2xl">No posts are waiting</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Qualifying opportunities will appear here after research, generation, and
                verification complete.
              </p>
              <a
                href="/"
                className="mt-5 inline-flex rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-bold"
              >
                View opportunities
              </a>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
