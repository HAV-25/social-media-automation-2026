import { KeyRound, MailCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyEmailCode } from "./actions";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string; sent?: string }>;
}) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") redirect("/sign-in");
  const params = await searchParams;
  const email = params.email?.trim() ?? "";

  return (
    <main className="fine-grid grid min-h-screen place-items-center px-6 py-12">
      <section className="paper-shadow w-full max-w-lg rounded-[2rem] border border-[var(--line)] bg-[var(--paper)] p-7 sm:p-10">
        <div className="flex size-11 items-center justify-center rounded-full bg-[var(--sage-soft)] text-[var(--sage)]">
          <MailCheck size={21} />
        </div>
        <p className="mt-6 text-xs font-bold tracking-[0.18em] text-[var(--accent)] uppercase">
          Verify email
        </p>
        <h1 className="serif mt-3 text-4xl tracking-[-0.035em]">Check your inbox.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Use the six-digit code in the email, or follow its confirmation link. Verification does
          not grant access to any brand.
        </p>

        {params.sent === "1" ? (
          <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            A verification email has been requested for {email || "your address"}.
          </p>
        ) : null}
        {params.error ? (
          <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            That code was not accepted. Check the email and enter the latest six-digit code.
          </p>
        ) : null}

        <form action={verifyEmailCode} className="mt-8 space-y-5">
          <label className="block text-sm font-semibold">
            Work email
            <input
              autoComplete="email"
              className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 outline-none transition focus:border-[var(--sage)] focus:ring-3 focus:ring-[var(--sage-soft)]"
              defaultValue={email}
              maxLength={254}
              name="email"
              required
              type="email"
            />
          </label>
          <label className="block text-sm font-semibold">
            Six-digit code
            <div className="relative mt-2">
              <KeyRound
                aria-hidden="true"
                className="absolute top-1/2 left-4 -translate-y-1/2 text-[var(--muted)]"
                size={18}
              />
              <input
                autoComplete="one-time-code"
                className="w-full rounded-xl border border-[var(--line)] bg-white py-3 pr-4 pl-12 font-mono text-lg tracking-[0.35em] outline-none transition focus:border-[var(--sage)] focus:ring-3 focus:ring-[var(--sage-soft)]"
                inputMode="numeric"
                maxLength={6}
                name="token"
                pattern="[0-9]{6}"
                required
              />
            </div>
          </label>
          <button className="w-full rounded-xl bg-[var(--ink)] px-5 py-3.5 font-semibold text-white transition hover:bg-[var(--sage)]">
            Verify account
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          <Link className="font-semibold text-[var(--sage)] underline" href="/sign-in">
            Return to sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
