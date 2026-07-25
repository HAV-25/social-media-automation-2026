"use client";

import { manualInputResultSchema, type ManualInputResult } from "@content-engine/contracts";
import { CheckCircle2, FileUp, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { WorkspaceBrand } from "@/lib/workspace";

export function SourceFileUploadForm({
  activeBrandId,
  brands,
}: {
  activeBrandId: string;
  brands: WorkspaceBrand[];
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ManualInputResult | null>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    formData.set("idempotencyKey", `upload:${crypto.randomUUID()}`);
    try {
      const response = await fetch("/api/inputs/upload", { method: "POST", body: formData });
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
              : "The file could not be extracted.";
        throw new Error(message);
      }
      setResult(manualInputResultSchema.parse(body));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The upload failed.");
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-7">
        <CheckCircle2 className="text-emerald-700" />
        <h2 className="serif mt-3 text-3xl text-emerald-950">File extracted and scored</h2>
        <a
          href={`/opportunities/${result.opportunityId}`}
          className="mt-5 inline-flex rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-bold text-white"
        >
          Inspect opportunity · {result.score.toFixed(0)}/100
        </a>
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
            Private file source
          </p>
          <h2 className="serif mt-2 text-3xl tracking-[-0.03em]">
            Extract a document or transcript
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            PDF, DOCX, TXT, VTT, or SRT · maximum 25 MB. Originals remain private.
          </p>
        </div>
        <FileUp className="text-[var(--sage)]" />
      </div>
      <input type="hidden" name="idempotencyKey" />
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
        <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">
          Source file
          <input
            required
            type="file"
            name="file"
            accept=".pdf,.docx,.txt,.vtt,.srt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/vtt,application/x-subrip"
            className="mt-1.5 block w-full rounded-xl border border-dashed border-[var(--line)] bg-stone-50 px-4 py-5 text-sm font-normal"
          />
        </label>
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
        {pending ? "Storing and extracting…" : "Upload source file"}
      </button>
    </form>
  );
}
