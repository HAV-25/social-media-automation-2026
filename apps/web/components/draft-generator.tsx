"use client";

import {
  contentStyleSchema,
  draftGenerationResultSchema,
  toneSchema,
  type ContentStyle,
  type DraftGenerationResult,
  type Tone,
} from "@content-engine/contracts";
import { BookOpenText, LoaderCircle, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  editorialStyles,
  explainStyleTone,
  getEditorialStyle,
  toneOverlays,
} from "@/lib/editorial-style-catalog";

function newIdempotencyKey() {
  return `draft:${crypto.randomUUID()}`;
}

export function DraftGenerator({
  defaultStyle,
  hasEvidence,
  opportunityId,
}: {
  defaultStyle: string;
  hasEvidence: boolean;
  opportunityId: string;
}) {
  const router = useRouter();
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [contentStyle, setContentStyle] = useState<ContentStyle>(
    contentStyleSchema.safeParse(defaultStyle).data ?? "perspective_conversation",
  );
  const [tone, setTone] = useState<Tone>("thoughtful");
  const selectedStyle = getEditorialStyle(contentStyle);

  // Real mode enqueues the draft on the lightweight worker and returns immediately;
  // poll the GET status until the post draft exists, then navigate to it.
  async function pollDraft() {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      const response = await fetch(`/api/opportunities/${opportunityId}/generate`, {
        method: "GET",
      });
      if (!response.ok) continue;
      const data = (await response.json()) as { status?: string; postDraftId?: string | null };
      if (data.status === "ready" && data.postDraftId) return data.postDraftId;
    }
    return null;
  }

  async function generate(formData: FormData) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/opportunities/${opportunityId}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractVersion: "1.0",
          idempotencyKey,
          contentStyle: String(formData.get("contentStyle")),
          tone: String(formData.get("tone")),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const failure = payload as { error?: { message?: string } };
        throw new Error(failure.error?.message ?? "The draft could not be generated.");
      }
      // Real mode: queued -> poll for the worker's draft. Demo mode returns the
      // draft synchronously.
      if ((payload as { status?: string }).status === "queued") {
        const postDraftId = await pollDraft();
        if (!postDraftId) {
          throw new Error("The draft is taking longer than expected. Refresh in a moment.");
        }
        router.push(`/posts/${postDraftId}`);
        return;
      }
      const result: DraftGenerationResult = draftGenerationResultSchema.parse(payload);
      router.push(`/posts/${result.postDraftId}`);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "The draft could not be generated.",
      );
      setPending(false);
    }
  }

  return (
    <form action={generate} className="rounded-3xl border border-[var(--line)] bg-white p-6">
      <Sparkles size={20} className="text-[var(--accent)]" />
      <h2 className="serif mt-3 text-xl">Create a reviewable draft</h2>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
        Three ranked angles, evidence mapping, brand fit, risk, and similarity are evaluated before
        review.
      </p>
      {!hasEvidence ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          Complete bounded research before generating an evidence-backed post.
        </p>
      ) : null}
      <label className="mt-4 block text-[10px] font-bold text-[var(--muted)] uppercase">
        Content style
        <select
          name="contentStyle"
          value={contentStyle}
          onChange={(event) => setContentStyle(contentStyleSchema.parse(event.target.value))}
          className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)] normal-case"
        >
          {editorialStyles.map((style) => (
            <option key={style.id} value={style.id}>
              {style.label}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{selectedStyle.purpose}</p>
      <label className="mt-3 block text-[10px] font-bold text-[var(--muted)] uppercase">
        Tone overlay
        <select
          name="tone"
          value={tone}
          onChange={(event) => setTone(toneSchema.parse(event.target.value))}
          className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)] normal-case"
        >
          {toneOverlays.map((overlay) => (
            <option key={overlay.id} value={overlay.id}>
              {overlay.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 rounded-xl bg-stone-50 p-3 text-xs leading-5 text-[var(--muted)]">
        {explainStyleTone(contentStyle, tone)}
      </div>
      <a
        href="/styles"
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--sage)]"
      >
        <BookOpenText size={14} /> Compare all styles and tones
      </a>
      {error ? <p className="mt-3 text-xs leading-5 text-red-700">{error}</p> : null}
      <button
        disabled={pending || !hasEvidence}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
        {pending ? "Creating immutable version…" : "Generate evaluated draft"}
      </button>
    </form>
  );
}
