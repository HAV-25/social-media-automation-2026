"use client";

import { postRegenerationResultSchema } from "@content-engine/contracts";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SelectiveRegeneration({
  postDraftId,
  versionId,
}: {
  postDraftId: string;
  versionId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function regenerate(formData: FormData) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/posts/${postDraftId}/regenerate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractVersion: "1.0",
          idempotencyKey: `regenerate:${crypto.randomUUID()}`,
          expectedVersionId: versionId,
          component: String(formData.get("component")),
          instruction: String(formData.get("instruction")),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const failure = payload as { error?: { message?: string } };
        throw new Error(failure.error?.message ?? "Selective regeneration failed.");
      }
      postRegenerationResultSchema.parse(payload);
      router.refresh();
      setPending(false);
    } catch (regenerationError) {
      setError(
        regenerationError instanceof Error
          ? regenerationError.message
          : "Selective regeneration failed.",
      );
      setPending(false);
    }
  }

  return (
    <form action={regenerate} className="rounded-3xl border border-[var(--line)] bg-white p-6">
      <RefreshCw size={19} className="text-[var(--accent)]" />
      <h2 className="serif mt-3 text-xl">Selective regeneration</h2>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
        Replace one component in a new immutable version. The other two components are preserved
        byte-for-byte.
      </p>
      <label className="mt-4 block text-[10px] font-bold text-[var(--muted)] uppercase">
        Component
        <select
          name="component"
          className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)] normal-case"
        >
          <option value="hook">Hook</option>
          <option value="body">Body</option>
          <option value="closing">Closing</option>
        </select>
      </label>
      <label className="mt-3 block text-[10px] font-bold text-[var(--muted)] uppercase">
        Direction
        <input
          required
          minLength={3}
          maxLength={500}
          name="instruction"
          defaultValue="Make it more concise"
          className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)] normal-case"
        />
      </label>
      {error ? <p className="mt-3 text-xs leading-5 text-red-700">{error}</p> : null}
      <button
        disabled={pending}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent)] px-4 py-3 text-sm font-bold text-[var(--accent)] disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        {pending ? "Creating new version…" : "Regenerate component"}
      </button>
    </form>
  );
}
