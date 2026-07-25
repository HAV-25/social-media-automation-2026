import { Clock3, LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth";
import { signOutPendingUser } from "./actions";

export default async function PendingAccessPage() {
  const authState = await getAuthState();
  if (authState.kind === "signed_out") redirect("/sign-in");
  if (authState.kind === "authorized") redirect("/");

  return (
    <main className="fine-grid grid min-h-screen place-items-center px-6 py-12">
      <section className="paper-shadow w-full max-w-xl rounded-[2rem] border border-[var(--line)] bg-[var(--paper)] p-7 sm:p-10">
        <div className="flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <Clock3 size={23} />
        </div>
        <p className="mt-6 text-xs font-bold tracking-[0.18em] text-[var(--accent)] uppercase">
          Verification complete
        </p>
        <h1 className="serif mt-3 text-4xl tracking-[-0.035em]">Access is pending.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Your account for <strong>{authState.identity.email}</strong> is verified. An administrator
          must now assign your organization, role, and brands.
        </p>

        <div className="mt-7 flex gap-3 rounded-2xl border border-[var(--line)] bg-white p-4">
          <LockKeyhole className="mt-0.5 shrink-0 text-[var(--sage)]" size={19} />
          <p className="text-sm leading-6 text-[var(--muted)]">
            Until approval, this account cannot read brand profiles, sources, opportunities, posts,
            images, runs, or audit history.
          </p>
        </div>

        <form action={signOutPendingUser} className="mt-8">
          <button className="w-full rounded-xl border border-[var(--line)] bg-white px-5 py-3.5 font-semibold text-[var(--ink)] transition hover:border-[var(--sage)]">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
