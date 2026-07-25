"use client";

import { FlaskConical, LoaderCircle, SearchCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function ResearchPanel({
  opportunityId,
  hasEvidence,
}: {
  opportunityId: string;
  hasEvidence: boolean;
}) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => setHydrated(true), []);

  async function startResearch() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/opportunities/${opportunityId}/research`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractVersion: "1.0",
          idempotencyKey: `research:${opportunityId}:${crypto.randomUUID()}`,
          allowedDomains: [],
        }),
      });
      const body = (await response.json()) as {
        error?: { message?: string };
        sourceCount?: number;
        claimCount?: number;
      };
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Research could not be completed.");
      }
      setMessage(
        `Evidence ready: ${body.sourceCount ?? 0} source and ${body.claimCount ?? 0} claim.`,
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Research could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl bg-[var(--ink)] p-6 text-white">
      <SearchCheck size={22} className="text-[#f0b39f]" />
      <h2 className="serif mt-4 text-2xl">
        {hasEvidence ? "Evidence package ready" : "Lean research checkpoint"}
      </h2>
      <p className="mt-3 text-sm leading-6 text-white/60">
        {hasEvidence
          ? "Claims and source links are available below. Regeneration stays bounded and reviewer-controlled."
          : "Inspect the source and score before spending a bounded research allowance of up to three queries."}
      </p>
      <button
        type="button"
        disabled={!hydrated || busy}
        onClick={startResearch}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-[var(--ink)] disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? (
          <>
            <LoaderCircle size={16} className="animate-spin" /> Researching…
          </>
        ) : (
          <>
            <FlaskConical size={16} />{" "}
            {hasEvidence ? "Run bounded research again" : "Start research"}
          </>
        )}
      </button>
      {message ? (
        <p role="status" className="mt-3 text-xs leading-5 text-white/70">
          {message}
        </p>
      ) : null}
    </section>
  );
}
