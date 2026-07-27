import {
  Archive,
  ArrowRight,
  Building2,
  CircleUserRound,
  Settings2,
  UsersRound,
} from "lucide-react";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { canManageBrand } from "@/lib/permissions";
import { getWorkspaceSnapshot } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const [user, { activeBrand, brands }] = await Promise.all([
    getCurrentUser(),
    getWorkspaceSnapshot(cookieStore.get("active-brand")?.value),
  ]);

  return (
    <>
      <header className="border-b border-[var(--line)] bg-[var(--canvas)]/90 px-6 py-5 backdrop-blur lg:px-10">
        <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
          Account and workspace
        </p>
        <h1 className="serif mt-1 text-4xl tracking-[-0.04em]">Settings</h1>
      </header>

      <section className="grid gap-5 px-6 py-8 lg:grid-cols-2 lg:px-10 lg:py-10">
        <article className="rounded-3xl border border-[var(--line)] bg-white p-6">
          <CircleUserRound size={24} className="text-[var(--sage)]" />
          <h2 className="serif mt-4 text-2xl">Your account</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-[var(--muted)]">Name</dt>
              <dd className="mt-1 font-semibold">{user?.displayName ?? "Authorized reviewer"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Role</dt>
              <dd className="mt-1 font-semibold capitalize">{user?.role ?? "reviewer"}</dd>
            </div>
          </dl>
        </article>

        <article className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6">
          <Building2 size={24} className="text-[var(--sage)]" />
          <h2 className="serif mt-4 text-2xl">Brand administration</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Configure voice, examples, visual assets, and the daily opportunity policy. You are
            currently working in {activeBrand.name} and have access to {brands.length} brands.
          </p>
          <a
            href="/brands"
            className="mt-5 flex items-center justify-between rounded-xl bg-[var(--ink)] px-4 py-3 text-sm font-bold text-white"
          >
            Manage brands <ArrowRight size={17} />
          </a>
        </article>

        {user?.organizationRole === "administrator" ? (
          <article className="rounded-3xl border border-[var(--line)] bg-white p-6">
            <UsersRound size={24} className="text-[var(--sage)]" />
            <h2 className="serif mt-4 text-2xl">Team &amp; access</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Review authorized users, organization roles, and brand assignments without exposing
              credentials or the private pilot allowlist.
            </p>
            <a
              href="/settings/members"
              className="mt-5 flex items-center justify-between rounded-xl bg-[var(--ink)] px-4 py-3 text-sm font-bold text-white"
            >
              Manage team access <ArrowRight size={17} />
            </a>
          </article>
        ) : null}

        {user && canManageBrand(user.role) ? (
          <article className="rounded-3xl border border-[var(--line)] bg-white p-6">
            <Archive size={24} className="text-[var(--sage)]" />
            <h2 className="serif mt-4 text-2xl">Retention &amp; archive</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Configure the rolling inbox and resurfacing windows for {activeBrand.name}. Archive
              remains non-destructive and preserves complete provenance.
            </p>
            <a
              href="/settings/archive"
              className="mt-5 flex items-center justify-between rounded-xl bg-[var(--ink)] px-4 py-3 text-sm font-bold text-white"
            >
              Manage archive controls <ArrowRight size={17} />
            </a>
          </article>
        ) : null}

        <article className="rounded-3xl border border-[var(--line)] bg-white p-6 lg:col-span-2">
          <Settings2 size={22} className="text-[var(--sage)]" />
          <h2 className="serif mt-4 text-2xl">Workflow boundary</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Automatic preparation can identify and create reviewable drafts, but this Phase 1
            application never schedules or publishes them. A human decision remains required before
            any approved package leaves the platform.
          </p>
        </article>
      </section>
    </>
  );
}
