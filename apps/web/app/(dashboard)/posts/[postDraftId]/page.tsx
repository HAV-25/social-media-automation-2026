import { randomUUID } from "node:crypto";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileClock,
  MessageSquareWarning,
  Save,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { notFound } from "next/navigation";
import { CopyPostButton } from "@/components/copy-post-button";
import { PostImageReview } from "@/components/post-image-review";
import { SelectiveRegeneration } from "@/components/selective-regeneration";
import { getCurrentUser } from "@/lib/auth";
import { canManageBrand, canReviewContent } from "@/lib/permissions";
import { getPostDetail } from "@/lib/post-detail";
import { getPostImageReviewState } from "@/lib/post-image-review";
import { reviewPost } from "../actions";

export const dynamic = "force-dynamic";

const statusStyles = {
  ready_for_review: "bg-blue-50 text-blue-800 border-blue-200",
  changes_requested: "bg-amber-50 text-amber-800 border-amber-200",
  approved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rejected: "bg-red-50 text-red-800 border-red-200",
};

function reviewKey(action: string) {
  return `review:${action}:${randomUUID()}`;
}

export default async function PostReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ postDraftId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const [{ postDraftId }, query, user] = await Promise.all([
    params,
    searchParams,
    getCurrentUser(),
  ]);
  const post = await getPostDetail(postDraftId);
  if (!post) notFound();
  const imageState = await getPostImageReviewState(post);
  const editable = Boolean(
    user && canManageBrand(user.role) && !["approved", "rejected"].includes(post.status),
  );
  const reviewable = Boolean(
    user && canReviewContent(user.role) && !["approved", "rejected"].includes(post.status),
  );
  const editAction = reviewPost.bind(null, postDraftId, "edit");
  const approveAction = reviewPost.bind(null, postDraftId, "approve");
  const rejectAction = reviewPost.bind(null, postDraftId, "reject");
  const requestChangesAction = reviewPost.bind(null, postDraftId, "request_changes");

  return (
    <>
      <header className="flex flex-wrap items-center gap-4 border-b border-[var(--line)] bg-[var(--canvas)]/90 px-6 py-5 backdrop-blur lg:px-10">
        <a
          href={`/opportunities/${post.opportunityId}`}
          className="grid size-9 place-items-center rounded-xl border border-[var(--line)] bg-white text-[var(--muted)]"
          aria-label="Back to opportunity"
        >
          <ArrowLeft size={17} />
        </a>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
            Human review desk
          </p>
          <h1 className="serif mt-1 truncate text-3xl tracking-[-0.03em]">{post.sourceTitle}</h1>
        </div>
        <span
          className={`rounded-full border px-3 py-1.5 text-xs font-bold capitalize ${statusStyles[post.status]}`}
        >
          {post.status.replaceAll("_", " ")}
        </span>
      </header>

      <section className="px-6 py-8 lg:px-10 lg:py-10">
        {query.error ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {query.error}
          </div>
        ) : null}
        {query.saved ? (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 size={17} /> Review action persisted with an audit event.
          </div>
        ) : null}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <form
              action={editAction}
              className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6 lg:p-8"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold tracking-[0.16em] text-[var(--sage)] uppercase">
                    Facebook draft · Version {post.currentVersion.versionNumber}
                  </p>
                  <h2 className="serif mt-2 text-3xl">Edit without losing the original</h2>
                </div>
                <CopyPostButton text={post.currentVersion.content.fullText} />
              </div>
              <fieldset disabled={!editable} className="mt-6 space-y-5 disabled:opacity-75">
                <input type="hidden" name="expectedVersionId" value={post.currentVersion.id} />
                <input type="hidden" name="idempotencyKey" value={reviewKey("edit")} />
                <label className="block text-xs font-bold text-[var(--muted)]">
                  Hook
                  <textarea
                    required
                    name="hook"
                    rows={3}
                    maxLength={500}
                    defaultValue={post.currentVersion.content.hook}
                    className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-base font-semibold leading-6 text-[var(--ink)] outline-none focus:border-[var(--sage)]"
                  />
                </label>
                <label className="block text-xs font-bold text-[var(--muted)]">
                  Body
                  <textarea
                    required
                    name="body"
                    rows={12}
                    maxLength={8000}
                    defaultValue={post.currentVersion.content.body}
                    className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal leading-7 text-[var(--ink)] outline-none focus:border-[var(--sage)]"
                  />
                </label>
                <label className="block text-xs font-bold text-[var(--muted)]">
                  Closing
                  <textarea
                    name="closing"
                    rows={3}
                    maxLength={1000}
                    defaultValue={post.currentVersion.content.closing}
                    className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal leading-6 text-[var(--ink)] outline-none focus:border-[var(--sage)]"
                  />
                </label>
                {editable ? (
                  <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sage)] px-5 py-3 text-sm font-bold text-white">
                    <Save size={17} /> Save as immutable Version{" "}
                    {post.currentVersion.versionNumber + 1}
                  </button>
                ) : null}
              </fieldset>
            </form>

            <PostImageReview postDraftId={post.id} editable={editable} state={imageState} />

            {editable ? (
              <SelectiveRegeneration postDraftId={post.id} versionId={post.currentVersion.id} />
            ) : null}

            {post.angles.length ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white p-6 lg:p-8">
                <p className="text-xs font-bold tracking-[0.16em] text-[var(--sage)] uppercase">
                  Angle architecture
                </p>
                <h2 className="serif mt-2 text-2xl">Three materially different routes</h2>
                <div className="mt-5 grid gap-3 lg:grid-cols-3">
                  {post.angles.map((angle) => (
                    <article
                      key={angle.angleKey}
                      className={`rounded-2xl border p-4 ${
                        angle.angleKey === post.selectedAngleKey
                          ? "border-[var(--sage)] bg-[var(--sage-soft)]"
                          : "border-[var(--line)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm">{angle.title}</strong>
                        <span className="text-xs font-bold">{angle.score.toFixed(0)}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{angle.thesis}</p>
                      <p className="mt-3 text-[10px] font-bold tracking-wide text-[var(--sage)] uppercase">
                        {angle.contentStyle.replaceAll("_", " ")}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-3xl border border-[var(--line)] bg-white p-6 lg:p-8">
              <p className="text-xs font-bold tracking-[0.16em] text-[var(--sage)] uppercase">
                Immutable provenance
              </p>
              <h2 className="serif mt-2 text-2xl">Version history</h2>
              <div className="mt-5 space-y-3">
                {post.versions.map((version) => (
                  <details
                    key={version.id}
                    className="rounded-2xl border border-[var(--line)] p-4"
                    open={version.id === post.currentVersion.id}
                  >
                    <summary className="cursor-pointer text-sm font-bold">
                      Version {version.versionNumber} ·{" "}
                      {version.generationType.replaceAll("_", " ")}
                    </summary>
                    <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-[var(--muted)]">
                      {version.content.fullText}
                    </p>
                    <p className="mt-2 text-[10px] text-[var(--muted)]">
                      {new Date(version.createdAt).toLocaleString()}
                    </p>
                  </details>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-[var(--line)] bg-white p-6 lg:p-8">
              <h2 className="serif text-2xl">Decision history</h2>
              {post.feedback.length ? (
                <div className="mt-5 space-y-3">
                  {post.feedback.map((event, index) => (
                    <div
                      key={`${event.createdAt}-${index}`}
                      className="flex gap-3 rounded-xl bg-stone-50 p-4"
                    >
                      <FileClock size={17} className="mt-0.5 text-[var(--sage)]" />
                      <div>
                        <p className="text-sm font-bold capitalize">
                          {event.eventType.replaceAll("_", " ")}
                        </p>
                        {event.reason ? (
                          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                            {event.reason}
                          </p>
                        ) : null}
                        <p className="mt-1 flex items-center gap-1 text-[10px] text-[var(--muted)]">
                          <Clock3 size={11} /> {new Date(event.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-[var(--muted)]">No human decision recorded yet.</p>
              )}
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6">
            <section className="rounded-3xl bg-[var(--ink)] p-6 text-white">
              <ShieldCheck size={21} className="text-[#f0b39f]" />
              <h2 className="serif mt-4 text-2xl">Quality checkpoint</h2>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-[10px] text-white/45 uppercase">Quality</p>
                  <strong className="serif mt-1 block text-2xl">
                    {post.qualityScore?.toFixed(0) ?? "—"}
                  </strong>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-[10px] text-white/45 uppercase">Evidence</p>
                  <strong className="serif mt-1 block text-2xl">
                    {post.evaluation?.evidenceScore.toFixed(0) ?? "—"}
                  </strong>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-[10px] text-white/45 uppercase">Brand fit</p>
                  <strong className="serif mt-1 block text-2xl">
                    {post.evaluation?.brandFitScore.toFixed(0) ?? "—"}
                  </strong>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-[10px] text-white/45 uppercase">Max similarity</p>
                  <strong className="serif mt-1 block text-2xl">
                    {post.evaluation
                      ? (
                          Math.max(
                            post.evaluation.sourceSimilarity,
                            post.evaluation.sameBrandSimilarity,
                          ) * 100
                        ).toFixed(0)
                      : "—"}
                  </strong>
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-white/55">
                {post.evaluation?.readyForReview
                  ? "All deterministic readiness gates pass. Human approval is still required."
                  : "Approval is blocked until evidence, brand-fit, risk, and similarity gates pass."}
              </p>
              {post.evaluation?.warnings.length ? (
                <ul className="mt-4 space-y-2 text-xs leading-5 text-amber-200">
                  {post.evaluation.warnings.map((warning) => (
                    <li key={warning}>• {warning}</li>
                  ))}
                </ul>
              ) : null}
            </section>

            {post.evaluation ? (
              <details className="rounded-2xl border border-[var(--line)] bg-white p-5">
                <summary className="cursor-pointer text-sm font-bold">
                  Claim verification · {post.evaluation.sentenceClaims.length} sentences
                </summary>
                <div className="mt-4 space-y-3">
                  {post.evaluation.sentenceClaims.map((mapping, index) => (
                    <div
                      key={`${mapping.sentence}-${index}`}
                      className="rounded-xl bg-stone-50 p-3 text-xs leading-5"
                    >
                      <strong className="capitalize">{mapping.state}</strong>
                      <p className="mt-1 text-[var(--muted)]">{mapping.sentence}</p>
                      {mapping.claimKeys.length ? (
                        <p className="mt-1 font-mono text-[10px] text-[var(--sage)]">
                          {mapping.claimKeys.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            <details className="rounded-2xl border border-[var(--line)] bg-white p-5">
              <summary className="cursor-pointer text-sm font-bold">Model provenance</summary>
              <dl className="mt-4 space-y-3 text-xs">
                <div>
                  <dt className="text-[var(--muted)]">Model</dt>
                  <dd className="mt-1 font-mono">{post.provenance.model ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Prompt version</dt>
                  <dd className="mt-1 font-mono">
                    {post.provenance.promptVersion ?? "Not recorded"}
                  </dd>
                </div>
                {post.provenance.promptSnapshot ? (
                  <>
                    <div>
                      <dt className="text-[var(--muted)]">Prompt checksum</dt>
                      <dd className="mt-1 break-all font-mono">
                        {post.provenance.promptSnapshot.checksum}
                      </dd>
                    </div>
                    <details className="rounded-xl border border-[var(--line)] bg-stone-50 p-3">
                      <summary className="cursor-pointer font-bold">Exact system prompt</summary>
                      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5">
                        {post.provenance.promptSnapshot.systemPrompt}
                      </pre>
                    </details>
                    <details className="rounded-xl border border-[var(--line)] bg-stone-50 p-3">
                      <summary className="cursor-pointer font-bold">
                        Exact generation prompt
                      </summary>
                      <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5">
                        {post.provenance.promptSnapshot.userPrompt}
                      </pre>
                    </details>
                  </>
                ) : (
                  <p className="rounded-xl bg-stone-50 p-3 text-[var(--muted)]">
                    Exact prompt capture was not available when this historical version was
                    generated.
                  </p>
                )}
                <div>
                  <dt className="text-[var(--muted)]">Response ID</dt>
                  <dd className="mt-1 break-all font-mono">
                    {post.provenance.responseId ?? "Not recorded"}
                  </dd>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <dt className="text-[var(--muted)]">Input</dt>
                    <dd className="mt-1 font-bold">{post.provenance.inputTokens}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Output</dt>
                    <dd className="mt-1 font-bold">{post.provenance.outputTokens}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Cost</dt>
                    <dd className="mt-1 font-bold">${post.provenance.costUsd.toFixed(2)}</dd>
                  </div>
                </div>
              </dl>
            </details>

            {reviewable ? (
              <section className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6">
                <h2 className="serif text-xl">Human decision</h2>
                {post.status === "ready_for_review" && post.evaluation?.readyForReview ? (
                  <form action={approveAction} className="mt-4">
                    <input type="hidden" name="expectedVersionId" value={post.currentVersion.id} />
                    <input type="hidden" name="idempotencyKey" value={reviewKey("approve")} />
                    <input type="hidden" name="reason" value="" />
                    <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white">
                      <ThumbsUp size={16} /> Approve post
                    </button>
                  </form>
                ) : null}
                {post.status === "ready_for_review" && !post.evaluation?.readyForReview ? (
                  <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    Approval is unavailable until every readiness gate passes.
                  </p>
                ) : null}

                {post.status === "ready_for_review" ? (
                  <form action={requestChangesAction} className="mt-4">
                    <input type="hidden" name="expectedVersionId" value={post.currentVersion.id} />
                    <input
                      type="hidden"
                      name="idempotencyKey"
                      value={reviewKey("request-changes")}
                    />
                    <label className="text-[10px] font-bold text-[var(--muted)] uppercase">
                      Change request
                      <textarea
                        required
                        minLength={3}
                        maxLength={2000}
                        name="reason"
                        rows={3}
                        className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-xs font-normal leading-5 text-[var(--ink)]"
                      />
                    </label>
                    <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-900">
                      <MessageSquareWarning size={16} /> Request changes
                    </button>
                  </form>
                ) : null}

                <form action={rejectAction} className="mt-4 border-t border-[var(--line)] pt-4">
                  <input type="hidden" name="expectedVersionId" value={post.currentVersion.id} />
                  <input type="hidden" name="idempotencyKey" value={reviewKey("reject")} />
                  <label className="text-[10px] font-bold text-[var(--muted)] uppercase">
                    Rejection reason
                    <textarea
                      required
                      minLength={3}
                      maxLength={2000}
                      name="reason"
                      rows={3}
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-xs font-normal leading-5 text-[var(--ink)]"
                    />
                  </label>
                  <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-800">
                    <ThumbsDown size={16} /> Reject post
                  </button>
                </form>
              </section>
            ) : null}
          </aside>
        </div>
      </section>
    </>
  );
}
