import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signUp } from "./actions";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") redirect("/sign-in");
  const params = await searchParams;

  return (
    <main className="fine-grid grid min-h-screen place-items-center px-6 py-12">
      <section className="paper-shadow w-full max-w-xl rounded-[2rem] border border-[var(--line)] bg-[var(--paper)] p-7 sm:p-10">
        <div className="flex size-11 items-center justify-center rounded-full bg-[var(--sage-soft)] text-[var(--sage)]">
          <ShieldCheck size={21} />
        </div>
        <p className="mt-6 text-xs font-bold tracking-[0.18em] text-[var(--accent)] uppercase">
          Internal account
        </p>
        <h1 className="serif mt-3 text-4xl tracking-[-0.035em]">Create your account.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Verify your work email first. Brand access remains locked until an administrator approves
          your account.
        </p>

        {params.error ? (
          <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {params.error === "invalid"
              ? "Check your details. Use a matching password of at least 12 characters."
              : "We could not create the account. Wait briefly and try again."}
          </p>
        ) : null}

        <form action={signUp} className="mt-8 space-y-5">
          <label className="block text-sm font-semibold">
            Display name
            <input
              autoComplete="name"
              className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 outline-none transition focus:border-[var(--sage)] focus:ring-3 focus:ring-[var(--sage-soft)]"
              maxLength={120}
              minLength={2}
              name="displayName"
              required
            />
          </label>
          <label className="block text-sm font-semibold">
            Work email
            <input
              autoComplete="email"
              className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 outline-none transition focus:border-[var(--sage)] focus:ring-3 focus:ring-[var(--sage-soft)]"
              maxLength={254}
              name="email"
              required
              type="email"
            />
          </label>
          <label className="block text-sm font-semibold">
            Password
            <input
              autoComplete="new-password"
              className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 outline-none transition focus:border-[var(--sage)] focus:ring-3 focus:ring-[var(--sage-soft)]"
              maxLength={128}
              minLength={12}
              name="password"
              required
              type="password"
            />
          </label>
          <label className="block text-sm font-semibold">
            Confirm password
            <input
              autoComplete="new-password"
              className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 outline-none transition focus:border-[var(--sage)] focus:ring-3 focus:ring-[var(--sage-soft)]"
              maxLength={128}
              name="confirmPassword"
              required
              type="password"
            />
          </label>
          <button className="flex w-full items-center justify-between rounded-xl bg-[var(--ink)] px-5 py-3.5 font-semibold text-white transition hover:bg-[var(--sage)]">
            Send verification <ArrowRight size={18} />
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          Already registered?{" "}
          <Link className="font-semibold text-[var(--sage)] underline" href="/sign-in">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
