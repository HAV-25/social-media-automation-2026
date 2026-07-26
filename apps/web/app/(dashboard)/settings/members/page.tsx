import { ArrowLeft, CheckCircle2, ShieldCheck, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getOrganizationMemberAccess } from "@/lib/member-access";
import { getWorkspaceSnapshot } from "@/lib/workspace";
import { saveMemberAccess } from "./actions";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, query, workspace] = await Promise.all([
    getCurrentUser(),
    searchParams,
    getWorkspaceSnapshot(),
  ]);
  if (!user) redirect("/sign-in");
  if (user.organizationRole !== "administrator") redirect("/settings?error=administrator_required");
  const members = await getOrganizationMemberAccess(
    user.organizationId,
    workspace.brands.map((brand) => brand.id),
  );
  const savedUserId = first(query.saved);

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
          Organization administration
        </p>
        <h1 className="serif mt-1 text-4xl tracking-[-0.04em]">Team &amp; access</h1>
      </header>

      <section className="px-6 py-8 lg:px-10 lg:py-10">
        {first(query.error) ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {first(query.error)}
          </div>
        ) : null}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-[var(--sage-soft)] text-[var(--sage)]">
                <UsersRound size={21} />
              </span>
              <div>
                <p className="text-sm font-bold">{members.length} authorized members</p>
                <p className="text-xs text-[var(--muted)]">
                  Organization role and per-brand access
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-5">
              {members.map((member) => {
                const assigned = new Map(
                  member.brandAssignments.map((assignment) => [
                    assignment.brandId,
                    assignment.role,
                  ]),
                );
                return (
                  <form
                    action={saveMemberAccess}
                    key={member.userId}
                    data-testid={`member-access-${member.userId}`}
                    className="rounded-3xl border border-[var(--line)] bg-white p-5 paper-shadow"
                  >
                    <input type="hidden" name="userId" value={member.userId} />
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-bold">{member.displayName}</h2>
                          {member.userId === user.id ? (
                            <span className="rounded-full bg-[var(--sage-soft)] px-2 py-1 text-[10px] font-bold text-[var(--sage)] uppercase">
                              You
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {member.email ?? "Email unavailable"} · joined{" "}
                          {new Date(member.joinedAt).toLocaleDateString()}
                        </p>
                      </div>
                      {savedUserId === member.userId ? (
                        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                          <CheckCircle2 size={15} /> Access saved
                        </span>
                      ) : null}
                    </div>

                    <label className="mt-5 block text-xs font-bold text-[var(--muted)]">
                      Organization role
                      <select
                        name="organizationRole"
                        defaultValue={member.organizationRole}
                        className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)]"
                      >
                        <option value="administrator">Administrator</option>
                        <option value="editor">Editor</option>
                        <option value="reviewer">Reviewer</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </label>

                    <fieldset className="mt-5">
                      <legend className="text-xs font-bold text-[var(--muted)]">
                        Assigned brands
                      </legend>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {workspace.brands.map((brand) => (
                          <label
                            key={brand.id}
                            className="grid grid-cols-[auto_1fr_130px] items-center gap-2 rounded-xl border border-[var(--line)] p-3"
                          >
                            <input
                              type="checkbox"
                              name="brandId"
                              value={brand.id}
                              defaultChecked={assigned.has(brand.id)}
                            />
                            <span className="truncate text-sm font-semibold">{brand.name}</span>
                            <select
                              aria-label={`${brand.name} role for ${member.displayName}`}
                              name={`brandRole:${brand.id}`}
                              defaultValue={assigned.get(brand.id) ?? "reviewer"}
                              className="rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-xs"
                            >
                              <option value="administrator">Administrator</option>
                              <option value="editor">Editor</option>
                              <option value="reviewer">Reviewer</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
                      <p className="max-w-xl text-xs leading-5 text-[var(--muted)]">
                        Organization administrators can see every brand. Other roles see only the
                        brands checked above, with the selected brand-level capability.
                      </p>
                      <button className="rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-bold text-white">
                        Save member access
                      </button>
                    </div>
                  </form>
                );
              })}
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <article className="rounded-3xl bg-[var(--ink)] p-6 text-white">
              <ShieldCheck size={22} className="text-[#f0b39f]" />
              <h2 className="serif mt-4 text-2xl">Access remains fail-closed</h2>
              <p className="mt-3 text-sm leading-6 text-white/65">
                Every change is reauthorized and applied atomically in PostgreSQL. RLS remains the
                final boundary, and the last organization administrator cannot be demoted.
              </p>
            </article>
            <article className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6">
              <h2 className="font-bold">Pilot provisioning</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                The approved-email pilot list still provisions all active brands by default. This
                screen structures access after an approved user has created their account; it does
                not expose the private allowlist or passwords.
              </p>
            </article>
          </aside>
        </div>
      </section>
    </>
  );
}
