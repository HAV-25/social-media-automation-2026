"use client";

import { CheckCircle2, FileText, LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { manualInputResultSchema, type ManualInputResult } from "@content-engine/contracts";
import type { WorkspaceBrand } from "@/lib/workspace";

type SubmissionError = { error?: { code?: string; message?: string } };

function createIdempotencyKey() {
  return `manual:${crypto.randomUUID()}`;
}

export function ManualInputForm({
  activeBrandId,
  brands,
}: {
  activeBrandId: string;
  brands: WorkspaceBrand[];
}) {
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [result, setResult] = useState<ManualInputResult | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/inputs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractVersion: "1.0",
          idempotencyKey,
          brandId: String(formData.get("brandId")),
          sourceType: "plain_text",
          title: String(formData.get("title")),
          text: String(formData.get("text")),
          language: String(formData.get("language")),
          rightsNotes: String(formData.get("rightsNotes")),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const failure = payload as SubmissionError;
        throw new Error(failure.error?.message ?? "The source could not be submitted.");
      }
      const parsed = manualInputResultSchema.safeParse(payload);
      if (!parsed.success) throw new Error("The server returned an invalid source result.");
      setResult(parsed.data);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "The source could not be submitted.",
      );
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8">
        <CheckCircle2 size={32} className="text-emerald-700" />
        <h2 className="serif mt-4 text-3xl text-emerald-950">
          {result.duplicate ? "Existing source linked" : "Source normalized and scored"}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-900/70">
          The exact content hash, brand routing, score breakdown, run, and audit event are durable.
          Research has not been triggered.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={`/opportunities/${result.opportunityId}`}
            className="rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-bold text-white"
          >
            Inspect opportunity · {result.score.toFixed(0)}/100
          </a>
          <button
            onClick={() => {
              setResult(null);
              setIdempotencyKey(createIdempotencyKey());
            }}
            className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-bold text-emerald-900"
          >
            Add another source
          </button>
        </div>
      </section>
    );
  }

  return (
    <form action={submit} className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6 lg:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
              Plain text or note
            </p>
            <h1 className="serif mt-2 text-4xl tracking-[-0.04em]">Capture the original idea</h1>
          </div>
          <FileText className="text-[var(--sage)]" />
        </div>
        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          <label className="text-xs font-bold text-[var(--muted)]">
            Working brand
            <select
              name="brandId"
              defaultValue={activeBrandId}
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm font-normal text-[var(--ink)]"
            >
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-[var(--muted)]">
            Language
            <select
              name="language"
              defaultValue="en"
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm font-normal text-[var(--ink)]"
            >
              <option value="en">English</option>
              <option value="de">German</option>
              <option value="fr">French</option>
              <option value="es">Spanish</option>
            </select>
          </label>
          <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">
            Source title
            <input
              required
              name="title"
              maxLength={1000}
              placeholder="A short, factual working title"
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--sage)]"
            />
          </label>
          <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">
            Original observation, memo, or rough idea
            <textarea
              required
              name="text"
              minLength={20}
              maxLength={500000}
              rows={14}
              placeholder="Paste or write the source material. It will be treated as untrusted data—not as instructions to the AI."
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal leading-6 text-[var(--ink)] outline-none focus:border-[var(--sage)]"
            />
          </label>
          <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">
            Rights or usage notes
            <textarea
              name="rightsNotes"
              rows={2}
              maxLength={2000}
              placeholder="Optional internal provenance or reuse restrictions"
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--sage)]"
            />
          </label>
        </div>
        {error ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        <button
          disabled={pending}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sage)] px-5 py-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? <LoaderCircle size={17} className="animate-spin" /> : null}
          {pending ? "Normalizing and scoring…" : "Add to content inbox"}
        </button>
      </div>

      <aside className="rounded-3xl bg-[var(--ink)] p-6 text-white xl:sticky xl:top-6">
        <ShieldCheck size={22} className="text-[#f0b39f]" />
        <h2 className="serif mt-4 text-2xl">What happens next</h2>
        <ol className="mt-5 space-y-4 text-sm leading-6 text-white/65">
          <li>
            <strong className="mr-2 text-white">1.</strong>Unicode and whitespace are normalized.
          </li>
          <li>
            <strong className="mr-2 text-white">2.</strong>An exact SHA-256 content hash prevents
            duplicate sources.
          </li>
          <li>
            <strong className="mr-2 text-white">3.</strong>A transparent preliminary score is stored
            dimension by dimension.
          </li>
          <li>
            <strong className="mr-2 text-white">4.</strong>The source enters the assigned brand
            only.
          </li>
        </ol>
        <p className="mt-6 border-t border-white/10 pt-5 text-xs leading-5 text-white/45">
          This lean stage makes no paid AI or research call and does not imply external
          verification.
        </p>
      </aside>
    </form>
  );
}
