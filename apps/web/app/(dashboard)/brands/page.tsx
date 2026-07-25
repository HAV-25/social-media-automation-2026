import { ArrowRight, CheckCircle2, CirclePlus, Layers3 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getBrandDirectory } from "@/lib/brand-configuration";
import { canManageOrganization } from "@/lib/permissions";
import { createBrand } from "./actions";

export const dynamic = "force-dynamic";

export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [user, brands, query] = await Promise.all([
    getCurrentUser(),
    getBrandDirectory(),
    searchParams,
  ]);

  return (
    <>
      <header className="border-b border-[var(--line)] bg-[var(--canvas)]/90 px-6 py-5 backdrop-blur lg:px-10">
        <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
          Brand system
        </p>
        <h1 className="serif mt-1 text-3xl tracking-[-0.03em]">Independent editorial memories</h1>
      </header>

      <section className="px-6 py-8 lg:px-10 lg:py-10">
        {query.error ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {query.error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {brands.map(({ brand, context, examples, assets }) => (
            <a
              key={brand.id}
              href={`/brands/${brand.id}`}
              className="group rounded-2xl border border-[var(--line)] bg-white/75 p-6 transition hover:-translate-y-0.5 hover:border-[var(--sage)] paper-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-11 place-items-center rounded-xl bg-[var(--sage-soft)] text-lg font-bold text-[var(--sage)]">
                  {brand.name.slice(0, 1)}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase ${
                    brand.status === "active"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {brand.status}
                </span>
              </div>
              <h2 className="serif mt-5 text-2xl">{brand.name}</h2>
              <p className="mt-2 min-h-10 text-sm leading-5 text-[var(--muted)]">
                {brand.description || "Positioning is awaiting team input."}
              </p>
              <div className="mt-6 grid grid-cols-3 gap-2 border-t border-[var(--line)] pt-4 text-center">
                <div>
                  <strong className="block text-lg">{context.completeness.score}%</strong>
                  <span className="text-[10px] text-[var(--muted)]">Complete</span>
                </div>
                <div>
                  <strong className="block text-lg">{examples.length}</strong>
                  <span className="text-[10px] text-[var(--muted)]">Examples</span>
                </div>
                <div>
                  <strong className="block text-lg">{assets.length}</strong>
                  <span className="text-[10px] text-[var(--muted)]">Assets</span>
                </div>
              </div>
              <span className="mt-5 flex items-center justify-between text-xs font-bold text-[var(--sage)]">
                Configure memory
                <ArrowRight size={16} className="transition group-hover:translate-x-1" />
              </span>
            </a>
          ))}
        </div>

        {user && canManageOrganization(user.role) ? (
          <div className="mt-10 grid gap-6 rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6 lg:grid-cols-[0.75fr_1.25fr] lg:p-8">
            <div>
              <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <CirclePlus size={20} />
              </div>
              <h2 className="serif mt-4 text-2xl">Add another internal brand</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                A new brand starts isolated, with its own voice, examples, assets, feed rules, and
                audit history.
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-[var(--sage)]">
                <CheckCircle2 size={15} /> Organization administrators only
              </div>
            </div>
            <form action={createBrand} className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold text-[var(--muted)]">
                Brand name
                <input
                  required
                  name="name"
                  maxLength={120}
                  className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--sage)]"
                />
              </label>
              <label className="text-xs font-bold text-[var(--muted)]">
                URL slug
                <input
                  required
                  name="slug"
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  placeholder="brand-name"
                  className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--sage)]"
                />
              </label>
              <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">
                Description
                <textarea
                  name="description"
                  rows={2}
                  maxLength={2000}
                  className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--sage)]"
                />
              </label>
              <label className="text-xs font-bold text-[var(--muted)]">
                Website
                <input
                  name="website"
                  type="url"
                  className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--sage)]"
                />
              </label>
              <input type="hidden" name="defaultLanguage" value="en" />
              <button className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-[var(--sage)] px-4 py-2.5 text-sm font-bold text-white">
                <Layers3 size={16} /> Create isolated brand
              </button>
            </form>
          </div>
        ) : null}
      </section>
    </>
  );
}
