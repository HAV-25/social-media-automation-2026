"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyPostButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-bold"
    >
      {copied ? <Check size={16} className="text-emerald-700" /> : <Copy size={16} />}
      {copied ? "Copied" : "Copy text"}
    </button>
  );
}
