"use client";

import { manualInputResultSchema, type ManualInputResult } from "@content-engine/contracts";
import { CheckCircle2, Link2, LoaderCircle, MessagesSquare } from "lucide-react";
import { useState } from "react";
import type { WorkspaceBrand } from "@/lib/workspace";

type InputKind = "url" | "transcript" | "social_content";

const kindLabels: Record<InputKind, string> = {
  url: "Article URL",
  transcript: "Transcript",
  social_content: "Social post",
};

export function OneOffInputForm({
  activeBrandId,
  brands,
}: {
  activeBrandId: string;
  brands: WorkspaceBrand[];
}) {
  const [kind, setKind] = useState<InputKind>("url");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ManualInputResult | null>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    setResult(null);
    const common = {
      contractVersion: "1.0",
      idempotencyKey: `one-off:${crypto.randomUUID()}`,
      brandId: String(formData.get("brandId")),
      sourceType: kind,
      language: String(formData.get("language")),
      rightsNotes: String(formData.get("rightsNotes")),
    };
    const payload =
      kind === "url"
        ? { ...common, url: String(formData.get("url")) }
        : {
            ...common,
            title: String(formData.get("title")),
            text: String(formData.get("text")),
            ...(kind === "social_content"
              ? { sourceUrl: String(formData.get("sourceUrl")) || undefined }
              : {}),
          };
    try {
      const response = await fetch("/api/inputs/one-off", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof body === "object" && body && "message" in body
            ? String(body.message)
            : typeof body === "object" &&
                body &&
                "error" in body &&
                typeof body.error === "object" &&
                body.error &&
                "message" in body.error
              ? String(body.error.message)
              : "The source could not be processed.";
        throw new Error(message);
      }
      setResult(manualInputResultSchema.parse(body));
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "The source could not be processed.",
      );
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-7">
        <CheckCircle2 className="text-emerald-700" />
        <h2 className="serif mt-3 text-3xl text-emerald-950">Source extracted and scored</h2>
        <p className="mt-2 text-sm text-emerald-900/70">
          The original provenance, normalized text, exact hash, and score are attached to the
          selected brand.
        </p>
        <div className="mt-5 flex gap-3">
          <a
            href={`/opportunities/${result.opportunityId}`}
            className="rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-bold text-white"
          >
            Inspect opportunity · {result.score.toFixed(0)}/100
          </a>
          <button
            type="button"
            onClick={() => setResult(null)}
            className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-bold"
          >
            Add another
          </button>
        </div>
      </section>
    );
  }

  return (
    <form
      action={submit}
      className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6 lg:p-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
            One-off source
          </p>
          <h2 className="serif mt-2 text-3xl tracking-[-0.03em]">
            Bring an external source into the desk
          </h2>
        </div>
        {kind === "url" ? (
          <Link2 className="text-[var(--sage)]" />
        ) : (
          <MessagesSquare className="text-[var(--sage)]" />
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="One-off source type">
        {(Object.keys(kindLabels) as InputKind[]).map((inputKind) => (
          <button
            key={inputKind}
            type="button"
            onClick={() => {
              setKind(inputKind);
              setError("");
            }}
            className={`rounded-full px-4 py-2 text-xs font-bold ${
              kind === inputKind
                ? "bg-[var(--ink)] text-white"
                : "border border-[var(--line)] bg-white text-[var(--muted)]"
            }`}
          >
            {kindLabels[inputKind]}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
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

        {kind === "url" ? (
          <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">
            Public article URL
            <input
              required
              type="url"
              name="url"
              placeholder="https://publisher.example/article"
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-[var(--ink)]"
            />
          </label>
        ) : (
          <>
            <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">
              Source title
              <input
                required
                name="title"
                maxLength={1000}
                className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-[var(--ink)]"
              />
            </label>
            {kind === "social_content" ? (
              <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">
                Original post URL (optional)
                <input
                  type="url"
                  name="sourceUrl"
                  className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-[var(--ink)]"
                />
              </label>
            ) : null}
            <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">
              {kind === "transcript" ? "Pasted transcript" : "Pasted social content"}
              <textarea
                required
                minLength={20}
                maxLength={kind === "transcript" ? 1_000_000 : 500_000}
                rows={10}
                name="text"
                className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm leading-6 font-normal text-[var(--ink)]"
              />
            </label>
          </>
        )}

        <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">
          Rights or usage notes
          <input
            name="rightsNotes"
            maxLength={2000}
            className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-[var(--ink)]"
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
        className="mt-6 flex items-center gap-2 rounded-xl bg-[var(--sage)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? <LoaderCircle size={17} className="animate-spin" /> : null}
        {pending ? "Extracting safely…" : `Add ${kindLabels[kind].toLowerCase()}`}
      </button>
    </form>
  );
}
