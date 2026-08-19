"use client";

import type { ImageDirection, ImageTemplate, ImageValidation } from "@content-engine/contracts";
import { Download, ImageIcon, Layers3, PackageOpen, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type State = {
  status: "concept_pending" | "validation_required" | "ready";
  imageAssetId: string | null;
  postVersionId: string;
  direction: ImageDirection;
  selectedConceptKey: string;
  template: ImageTemplate;
  validation: ImageValidation | null;
  model: string | null;
  prompt: string | null;
  promptVersion: string | null;
  estimatedCostUsd: number;
};

const templateLabels: Record<ImageTemplate, string> = {
  editorial_overlay: "Editorial overlay",
  insight_split: "Insight split",
  concept_frame: "Concept frame",
  headline_panel: "Headline panel",
};

export function PostImageReview({
  postDraftId,
  editable,
  state,
}: {
  postDraftId: string;
  editable: boolean;
  state: State;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [conceptKey, setConceptKey] = useState(state.selectedConceptKey);
  const [template, setTemplate] = useState<ImageTemplate>(state.template);

  function run(
    action:
      | "generate"
      | "regenerate_concept"
      | "select_concept"
      | "regenerate_base"
      | "change_template",
  ) {
    setError("");
    startTransition(async () => {
      const previousAssetId = state.imageAssetId;
      const response = await fetch(`/api/posts/${postDraftId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractVersion: "1.0",
          idempotencyKey: `image:${action}:${crypto.randomUUID()}`,
          expectedVersionId: state.postVersionId,
          action,
          ...(["generate", "select_concept"].includes(action) ? { conceptKey } : {}),
          ...(["generate", "change_template"].includes(action) ? { template } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
        status?: string;
      } | null;
      if (!response.ok) {
        setError(
          body?.error?.message ?? "The image action could not be completed. Please try again.",
        );
        return;
      }
      // Demo/in-process mode returns the finished result immediately.
      if (body?.status !== "queued") {
        router.refresh();
        return;
      }
      // Real mode: the lightweight worker is generating the image. Poll the
      // status endpoint until a new ready image lands, then refresh.
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 4_000));
        const statusResponse = await fetch(`/api/posts/${postDraftId}/images`, { method: "GET" });
        const statusBody = (await statusResponse.json().catch(() => null)) as {
          status?: string;
          imageAssetId?: string | null;
        } | null;
        if (
          statusResponse.ok &&
          statusBody?.status === "ready" &&
          statusBody.imageAssetId &&
          statusBody.imageAssetId !== previousAssetId
        ) {
          router.refresh();
          return;
        }
      }
      setError(
        "The image is still generating on the server. Wait a moment, then refresh to see it.",
      );
    });
  }

  return (
    <section
      className="overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--paper)]"
      data-testid="post-image-review"
    >
      <div className="border-b border-[var(--line)] p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-[var(--sage)] uppercase">
              Branded visual
            </p>
            <h2 className="serif mt-2 text-3xl">Direct the image without rewriting the post</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Base artwork stays text-free. Typography, brand colors, and layout are composed
              deterministically at 1200×630.
            </p>
          </div>
          <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-bold capitalize">
            {state.status.replaceAll("_", " ")}
          </span>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="bg-[var(--ink)] p-4 sm:p-6">
          {state.prompt ? (
            <details
              open
              className="mb-4 rounded-2xl border border-white/15 bg-white/5 p-4 text-white"
              data-testid="image-generation-prompt"
            >
              <summary className="cursor-pointer text-xs font-bold tracking-[0.12em] uppercase">
                Exact image-generation prompt
              </summary>
              <p className="mt-2 text-[11px] leading-5 text-white/55">
                Sent to {state.model ?? "the recorded image model"} using{" "}
                {state.promptVersion ?? "an unversioned prompt"}.
              </p>
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-black/20 p-3 font-mono text-[11px] leading-5 text-white/80">
                {state.prompt}
              </pre>
            </details>
          ) : null}
          {state.status === "ready" && state.imageAssetId ? (
            <img
              key={state.imageAssetId}
              src={`/api/posts/${postDraftId}/image?v=${state.imageAssetId}`}
              alt="Current branded Facebook post image"
              width={1200}
              height={630}
              className="aspect-[1200/630] w-full rounded-2xl border border-white/10 object-cover shadow-2xl"
              data-testid="post-image-preview"
            />
          ) : (
            <div className="grid aspect-[1200/630] place-items-center rounded-2xl border border-dashed border-white/20 bg-white/5 text-center text-white/60">
              <div>
                <ImageIcon className="mx-auto" size={30} />
                <p className="mt-3 text-sm font-semibold">
                  Concepts are ready for human direction.
                </p>
                <p className="mt-1 text-xs text-white/40">Generate one image when you choose.</p>
              </div>
            </div>
          )}
          {state.status === "ready" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={`/api/posts/${postDraftId}/image?download=1`}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-[var(--ink)]"
                data-testid="download-image"
              >
                <Download size={15} /> Download image
              </a>
              <a
                href={`/api/posts/${postDraftId}/download`}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-xs font-bold text-white"
                data-testid="download-package"
              >
                <PackageOpen size={15} /> Download package
              </a>
            </div>
          ) : null}
        </div>

        <div className="space-y-6 p-6 lg:p-8">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold">Three ranked concepts</h3>
              {editable ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run("regenerate_concept")}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--sage)] disabled:opacity-50"
                >
                  <Sparkles size={14} /> New concepts
                </button>
              ) : null}
            </div>
            <div className="mt-3 space-y-2">
              {state.direction.concepts.map((concept) => (
                <label
                  key={concept.conceptKey}
                  className={`block cursor-pointer rounded-2xl border p-3 transition ${
                    conceptKey === concept.conceptKey
                      ? "border-[var(--sage)] bg-[var(--sage-soft)]"
                      : "border-[var(--line)] bg-white"
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="image-concept"
                      value={concept.conceptKey}
                      checked={conceptKey === concept.conceptKey}
                      disabled={!editable || pending}
                      onChange={() => setConceptKey(concept.conceptKey)}
                      className="mt-1"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center justify-between gap-3">
                        <strong className="text-xs">
                          {concept.rank}. {concept.title}
                        </strong>
                        <span className="text-[10px] font-bold">{concept.score.toFixed(0)}</span>
                      </span>
                      <span className="mt-1 block text-[11px] leading-4 text-[var(--muted)]">
                        {concept.rankExplanation}
                      </span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {editable && state.status === "ready" && conceptKey !== state.selectedConceptKey ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run("select_concept")}
                className="mt-3 w-full rounded-xl border border-[var(--sage)] px-4 py-2.5 text-xs font-bold text-[var(--sage)] disabled:opacity-50"
              >
                Generate selected concept
              </button>
            ) : null}
          </div>

          <div className="border-t border-[var(--line)] pt-5">
            <label className="text-xs font-bold">
              Composition template
              <select
                value={template}
                disabled={!editable || pending}
                onChange={(event) => setTemplate(event.target.value as ImageTemplate)}
                className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm"
              >
                {Object.entries(templateLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {editable && state.status === "ready" && template !== state.template ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run("change_template")}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--line)] px-4 py-2.5 text-xs font-bold disabled:opacity-50"
              >
                <Layers3 size={15} /> Apply template only
              </button>
            ) : null}
          </div>

          {editable ? (
            state.status === "concept_pending" ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run("generate")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sage)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                data-testid="generate-image"
              >
                <Sparkles size={16} /> {pending ? "Composing…" : "Generate selected image"}
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => run("regenerate_base")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                data-testid="regenerate-base-image"
              >
                <RefreshCw size={16} /> {pending ? "Regenerating…" : "Regenerate base only"}
              </button>
            )
          ) : null}

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
              {error}
            </p>
          ) : null}

          {pending ? (
            <p className="text-xs leading-5 text-[var(--muted)]">
              Generating on the server — this can take up to a minute…
            </p>
          ) : null}

          {state.validation ? (
            <div className="rounded-xl bg-stone-50 p-3 text-[11px] leading-5 text-[var(--muted)]">
              Validation: {state.validation.width}×{state.validation.height} base ·{" "}
              {state.validation.warnings.length
                ? state.validation.warnings.join(" ")
                : "all deterministic checks passed"}
              <br />
              Model: {state.model ?? "not recorded"} · Cost: ${state.estimatedCostUsd.toFixed(3)}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
