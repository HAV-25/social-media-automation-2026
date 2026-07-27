"use client";

import { rssManualRunResultSchema, type RssManualRunResult } from "@content-engine/contracts";
import { LoaderCircle, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

function newRequest() {
  return {
    correlationId: crypto.randomUUID(),
    idempotencyKey: `rss-manual-run:${crypto.randomUUID()}`,
  };
}

export function RssRunTrigger({ brandId, brandName }: { brandId: string; brandName: string }) {
  const router = useRouter();
  const [request, setRequest] = useState(newRequest);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function trigger() {
    setPending(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/rss-intake/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractVersion: "1.0",
          brandId,
          ...request,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const failure = payload as { error?: { message?: string } };
        throw new Error(failure.error?.message ?? "The RSS intake session could not be started.");
      }
      const result: RssManualRunResult = rssManualRunResultSchema.parse(payload);
      setMessage(
        result.duplicate
          ? "This request was already accepted; no duplicate session was created."
          : `RSS intake started for ${brandName}. New sources and opportunities will appear as they are processed.`,
      );
      setRequest(newRequest());
      router.refresh();
    } catch (triggerError) {
      setError(
        triggerError instanceof Error
          ? triggerError.message
          : "The RSS intake session could not be started.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-5 paper-shadow">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-[var(--accent)] uppercase">
            Demo control
          </p>
          <h2 className="serif mt-1 text-xl">Run this brand’s RSS intake now</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--muted)]">
            Fetches only active feeds routed to {brandName}, then normalizes, deduplicates, clusters
            and scores their items. Qualifying opportunities are prepared automatically through
            research, three styles, verification and branded images, then stop for human review.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={trigger}
          className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />}
          {pending ? "Starting…" : "Run RSS intake now"}
        </button>
      </div>
      {message ? (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
