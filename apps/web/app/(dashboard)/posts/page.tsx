import { ArrowRight, CheckCircle2, FileClock, Sparkles } from "lucide-react";
import { cookies } from "next/headers";
import { getReadyPosts } from "@/lib/ready-posts";
import { getWorkspaceSnapshot } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const statusLabel = {
  ready_for_review: "Ready for review",
  changes_requested: "Changes requested",
};

export default async function ReadyPostsPage() {
  const cookieStore = await cookies();
  const { activeBrand } = await getWorkspaceSnapshot(cookieStore.get("active-brand")?.value);
  const posts = await getReadyPosts(activeBrand.id);

  return (
    <>
      <header className="border-b border-[var(--line)] bg-[var(--canvas)]/90 px-6 py-5 backdrop-blur lg:px-10">
        <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
          {activeBrand.name} · Review queue
        </p>
        <h1 className="serif mt-1 text-4xl tracking-[-0.04em]">Ready posts</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Drafts that completed generation and verification. Open a post to inspect evidence, edit,
          regenerate selected parts, approve, or reject it.
        </p>
      </header>

      <section className="px-6 py-8 lg:px-10 lg:py-10">
        <div className="mb-6 flex items-center gap-2 text-sm text-[var(--muted)]">
          <CheckCircle2 size={17} className="text-[var(--sage)]" />
          <strong className="text-[var(--ink)]">{posts.length}</strong> post
          {posts.length === 1 ? "" : "s"} awaiting editorial action
        </div>

        <div className="space-y-4">
          {posts.map((post) => (
            <article
              key={post.id}
              className="rounded-3xl border border-[var(--line)] bg-white p-6 paper-shadow"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold tracking-[0.12em] uppercase">
                    <span className="rounded-full bg-[var(--sage-soft)] px-2.5 py-1 text-[var(--sage)]">
                      {statusLabel[post.status]}
                    </span>
                    <span className="text-[var(--muted)]">
                      {post.contentStyle.replaceAll("_", " ")} · {post.tone}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-[var(--muted)]">{post.sourceTitle}</p>
                  <h2 className="serif mt-2 text-2xl leading-8">{post.hook}</h2>
                  <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--muted)]">
                    {post.excerpt}
                    {post.excerpt.length === 220 ? "…" : ""}
                  </p>
                </div>
                <div className="grid min-w-32 grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl bg-stone-50 p-3">
                    <p className="text-[9px] font-bold text-[var(--muted)] uppercase">Quality</p>
                    <strong className="serif mt-1 block text-xl">
                      {post.qualityScore?.toFixed(0) ?? "—"}
                    </strong>
                  </div>
                  <div className="rounded-xl bg-stone-50 p-3">
                    <p className="text-[9px] font-bold text-[var(--muted)] uppercase">Version</p>
                    <strong className="serif mt-1 block text-xl">{post.versionNumber}</strong>
                  </div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
                <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                  <FileClock size={14} />
                  Updated {new Date(post.updatedAt).toLocaleString()}
                </span>
                <a
                  href={`/posts/${post.id}`}
                  className="flex items-center gap-2 rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-bold text-white"
                >
                  Review post <ArrowRight size={16} />
                </a>
              </div>
            </article>
          ))}

          {posts.length === 0 ? (
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
