"use client";

import { draftGenerationResultSchema, type DraftGenerationResult } from "@content-engine/contracts";
import { LoaderCircle, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
          defaultValue={defaultStyle}
          className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)] normal-case"
        >
          <option value="newsworthy_authority">Newsworthy Authority</option>
          <option value="educational_breakdown">Educational Breakdown</option>
          <option value="perspective_conversation">Perspective & Conversation</option>
        </select>
      </label>
      <label className="mt-3 block text-[10px] font-bold text-[var(--muted)] uppercase">
        Tone overlay
        <select
          name="tone"
          defaultValue="thoughtful"
          className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)] normal-case"
        >
          <option value="authoritative">Authoritative</option>
          <option value="conversational">Conversational</option>
          <option value="bold">Bold</option>
          <option value="thoughtful">Thoughtful</option>
          <option value="witty">Witty</option>
        </select>
      </label>
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
