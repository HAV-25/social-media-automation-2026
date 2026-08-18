"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

// A form submit button that reflects the enclosing form's pending state:
// while the server action runs it disables itself and shows a spinner, so a
// click gives immediate feedback and can't be double-submitted.
export function SubmitButton({
  children,
  className,
  pendingLabel = "Submitting…",
}: {
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={[className, "disabled:cursor-not-allowed disabled:opacity-70"]
        .filter(Boolean)
        .join(" ")}
    >
      {pending ? (
        <>
          <Loader2 size={16} className="animate-spin" /> {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
