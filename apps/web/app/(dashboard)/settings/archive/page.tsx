import { Archive, ArrowLeft, CheckCircle2, Database, TimerReset } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBrandArchivePolicy } from "@/lib/brand-archive-policy";
import { canManageBrand } from "@/lib/permissions";
import { getWorkspaceSnapshot } from "@/lib/workspace";
import { saveBrandArchivePolicy } from "./actions";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ArchiveSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, cookieStore, query] = await Promise.all([getCurrentUser(), cookies(), searchParams]);
  if (!user) redirect("/sign-in");
  if (!canManageBrand(user.role)) redirect("/settings?error=editor_required");
  const workspace = await getWorkspaceSnapshot(cookieStore.get("active-brand")?.value);
  const policy = await getBrandArchivePolicy(workspace.activeBrand.id);

  return (
    <>
      <header className="border-b border-[var(--line)] bg-[var(--canvas)]/90 px-6 py-5 backdrop-blur lg:px-10">
        <a
          href="/settings"
          className="flex w-fit items-center gap-2 text-xs font-bold text-[var(--sage)]"
        >
          <ArrowLeft size={14} /> Settings
        </a>
        <p className="mt-4 text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
          {workspace.activeBrand.name} · content retention
        </p>
        <h1 className="serif mt-1 text-4xl tracking-[-0.04em]">Archive controls</h1>
      </header>

      <section className="px-6 py-8 lg:px-10 lg:py-10">
        {first(query.error) ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {first(query.error)}
          </div>
        ) : null}
        {first(query.saved) ? (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            <CheckCircle2 size={16} /> Archive controls saved for {workspace.activeBrand.name}.
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,720px)_320px]">
          <form
            action={saveBrandArchivePolicy}
            className="rounded-3xl border border-[var(--line)] bg-white p-6 paper-shadow"
          >
            <input type="hidden" name="brandId" value={workspace.activeBrand.id} />
            <Archive size={23} className="text-[var(--sage)]" />
            <h2 className="serif mt-4 text-3xl">Rolling article visibility</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              These controls change where RSS articles appear. They never delete sources, evidence,
              drafts, images, costs, feedback, or audit history.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold text-[var(--muted)]">
                Active inbox window
                <select
                  name="inboxWindowHours"
                  defaultValue={policy.inboxWindowHours}
                  className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)]"
                >
                  <option value="12">12 hours</option>
                  <option value="24">24 hours</option>
                  <option value="48">48 hours</option>
                  <option value="72">3 days</option>
                  <option value="168">7 days</option>
                </select>
              </label>
              <label className="text-xs font-bold text-[var(--muted)]">
                Resurfaced review window
                <select
                  name="resurfaceWindowHours"
                  defaultValue={policy.resurfaceWindowHours}
                  className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)]"
                >
                  <option value="12">12 hours</option>
                  <option value="24">24 hours</option>
                  <option value="48">48 hours</option>
                  <option value="72">3 days</option>
                  <option value="168">7 days</option>
                </select>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5">
              <p className="max-w-lg text-xs leading-5 text-[var(--muted)]">
                Automatic opportunity selection still resets at 00:00 UTC. Changing the rolling
                inbox does not increase the daily maximum or create new AI work.
              </p>
              <button className="rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-bold text-white">
                Save archive controls
              </button>
            </div>
          </form>

          <aside className="space-y-4">
            <article className="rounded-3xl bg-[var(--ink)] p-6 text-white">
              <Database size={21} className="text-[#f0b39f]" />
              <h2 className="serif mt-4 text-2xl">Non-destructive archive</h2>
              <p className="mt-3 text-sm leading-6 text-white/65">
                Older articles move out of the active inbox but remain durable and searchable in
                Archive with their complete downstream outcome.
              </p>
            </article>
            <article className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6">
              <TimerReset size={20} className="text-[var(--sage)]" />
              <h2 className="mt-3 font-bold">Resurfacing is bounded</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Resurfacing restores review visibility only. It does not change the score, reserve
                an automatic slot, run AI, approve a post, or publish anything.
              </p>
            </article>
          </aside>
        </div>
      </section>
    </>
  );
}
