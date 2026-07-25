import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { signIn } from "./actions";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

  return (
    <main className="fine-grid grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="flex min-h-[44vh] flex-col justify-between bg-[var(--sage)] p-8 text-[#f9f5ec] lg:min-h-screen lg:p-14">
        <div className="flex items-center gap-3 text-sm font-semibold tracking-[0.18em] uppercase">
          <span className="grid size-9 place-items-center rounded-full border border-white/30">
            E
          </span>
          Editorial Desk
        </div>
        <div className="max-w-2xl py-12">
          <p className="mb-5 text-xs font-bold tracking-[0.22em] text-[#f0b39f] uppercase">
            Research · Strategy · Production
          </p>
          <h1 className="serif text-5xl leading-[0.98] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
            Ideas become credible before they become content.
          </h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-white/70">
            An evidence-led editorial operating system for multiple brands—built for human judgment,
            not automatic publishing.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-7 gap-y-3 text-sm text-white/65">
          <span className="flex items-center gap-2">
            <ShieldCheck size={16} /> Brand-isolated
          </span>
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} /> Human-approved
          </span>
        </div>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="paper-shadow w-full max-w-md rounded-[2rem] border border-[var(--line)] bg-[var(--paper)] p-7 sm:p-10">
          <p className="text-xs font-bold tracking-[0.18em] text-[var(--accent)] uppercase">
            Internal access
          </p>
          <h2 className="serif mt-3 text-4xl tracking-[-0.035em]">Welcome back.</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Sign in to enter your assigned brand workspaces.
          </p>

          {params.error ? (
            <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              The email or password was not accepted.
            </p>
          ) : null}

          <form action={signIn} className="mt-8 space-y-5">
            <label className="block text-sm font-semibold">
              Email
              <input
                name="email"
                type="email"
                defaultValue={demoMode ? "arun@example.internal" : ""}
                required
                className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 outline-none transition focus:border-[var(--sage)] focus:ring-3 focus:ring-[var(--sage-soft)]"
              />
            </label>
            <label className="block text-sm font-semibold">
              Password
              <input
                name="password"
                type="password"
                defaultValue={demoMode ? "demo-only" : ""}
                required
                className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 outline-none transition focus:border-[var(--sage)] focus:ring-3 focus:ring-[var(--sage-soft)]"
              />
            </label>
            <button className="flex w-full items-center justify-between rounded-xl bg-[var(--ink)] px-5 py-3.5 font-semibold text-white transition hover:bg-[var(--sage)]">
              Enter Editorial Desk <ArrowRight size={18} />
            </button>
          </form>

          {demoMode ? (
            <p className="mt-5 rounded-xl bg-[var(--pale,theme(colors.stone.100))] p-3 text-xs leading-5 text-[var(--muted)]">
              Local demo mode is active. These credentials do not grant database access.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
