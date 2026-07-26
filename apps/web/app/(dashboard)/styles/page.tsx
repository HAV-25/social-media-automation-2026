import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Layers3,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { cookies } from "next/headers";
import { getBrandConfiguration } from "@/lib/brand-configuration";
import { editorialStyles, toneOverlays } from "@/lib/editorial-style-catalog";
import { getWorkspaceSnapshot } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function StylesPage() {
  const cookieStore = await cookies();
  const { activeBrand } = await getWorkspaceSnapshot(cookieStore.get("active-brand")?.value);
  const configuration = await getBrandConfiguration(activeBrand.id);
  const policy = configuration?.opportunityPolicy;
  const automaticLimit = policy?.dailyDraftLimit ?? 3;
  const automaticThreshold = policy?.minimumScore ?? 75;

  return (
    <>
      <header className="border-b border-[var(--line)] bg-[var(--canvas)]/90 px-6 py-5 backdrop-blur lg:px-10">
        <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
          {activeBrand.name} · Editorial system
        </p>
        <h1 className="serif mt-1 text-4xl tracking-[-0.04em]">Styles & tone</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Style controls what the post is trying to do and how it is structured. Tone controls how
          the same evidence-backed idea sounds. Neither control changes the claims ledger or safety
          rules.
        </p>
      </header>

      <section className="space-y-8 px-6 py-8 lg:px-10 lg:py-10">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
          <article className="rounded-3xl bg-[var(--sage)] p-6 text-white paper-shadow lg:p-8">
            <div className="flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-white/60 uppercase">
              <Layers3 size={17} /> How automatic preparation uses them
            </div>
            <h2 className="serif mt-4 max-w-2xl text-3xl leading-tight">
              One strong opportunity can produce three genuinely different editorial options.
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/70">
              An eligible {activeBrand.name} opportunity scoring at least {automaticThreshold} can
              enter preparation. The automatic workflow requests all three styles using the
              Thoughtful overlay, verifies every draft independently, and stops at human review.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <span className="serif text-3xl">{automaticLimit}</span>
                <p className="mt-1 text-xs leading-5 text-white/60">
                  maximum automatically selected opportunities per UTC day
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <span className="serif text-3xl">3</span>
                <p className="mt-1 text-xs leading-5 text-white/60">
                  independently generated styles per eligible opportunity
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <span className="serif text-3xl">{automaticLimit * 3}</span>
                <p className="mt-1 text-xs leading-5 text-white/60">
                  maximum draft variants entering review before evidence or quality holds
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-3xl border border-[var(--line)] bg-white p-6 lg:p-8">
            <ShieldCheck size={23} className="text-[var(--sage)]" />
            <h2 className="serif mt-4 text-2xl">Controlled, not prompt-edited</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              Reviewers choose approved controls. Production prompts remain versioned in code and
              cannot be changed from this screen.
            </p>
            <ul className="mt-5 space-y-3 text-sm">
              {[
                "Source evidence remains authoritative",
                "Brand voice is applied separately",
                "Every variant is evaluated independently",
                "Nothing is scheduled or published",
              ].map((rule) => (
                <li key={rule} className="flex gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--sage)]" />
                  {rule}
                </li>
              ))}
            </ul>
          </article>
        </div>

        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[0.16em] text-[var(--sage)] uppercase">
                Strategic structure
              </p>
              <h2 className="serif mt-2 text-3xl">Three standard styles</h2>
            </div>
            <BookOpenCheck className="hidden text-[var(--sage)] sm:block" />
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-3">
            {editorialStyles.map((style, index) => (
              <article
                key={style.id}
                className="flex flex-col rounded-3xl border border-[var(--line)] bg-white p-6"
              >
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-full bg-[var(--sage-soft)] text-sm font-bold text-[var(--sage)]">
                    0{index + 1}
                  </span>
                  <Sparkles size={18} className="text-[var(--accent)]" />
                </div>
                <h3 className="serif mt-5 text-2xl">{style.label}</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{style.purpose}</p>
                <div className="mt-5 rounded-2xl bg-[var(--paper)] p-4">
                  <p className="text-[10px] font-bold tracking-[0.14em] text-[var(--sage)] uppercase">
                    Reader outcome
                  </p>
                  <p className="mt-2 text-xs leading-5">{style.outcome}</p>
                </div>
                <div className="mt-5">
                  <p className="text-[10px] font-bold tracking-[0.14em] text-[var(--muted)] uppercase">
                    Typical structure
                  </p>
                  <ol className="mt-3 space-y-2 text-xs leading-5">
                    {style.structure.map((step, stepIndex) => (
                      <li key={step} className="flex gap-2">
                        <span className="font-bold text-[var(--accent)]">{stepIndex + 1}.</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="mt-5 border-t border-[var(--line)] pt-5">
                  <p className="text-[10px] font-bold tracking-[0.14em] text-[var(--muted)] uppercase">
                    Best for
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {style.bestFor.map((item) => (
                      <span
                        key={item}
                        className="rounded-full bg-[var(--sage-soft)] px-2.5 py-1 text-[10px] font-bold text-[var(--sage)]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-5">
                  <p className="text-[10px] font-bold tracking-[0.14em] text-[var(--muted)] uppercase">
                    Avoid
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                    {style.avoid.join(" · ")}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-[var(--sage)] uppercase">
              Voice treatment
            </p>
            <h2 className="serif mt-2 text-3xl">Five tone overlays</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              A tone never changes the underlying facts. It adjusts rhythm, formality, energy, and
              personality within {activeBrand.name}&apos;s voice profile.
            </p>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {toneOverlays.map((tone) => (
              <article
                key={tone.id}
                className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5"
              >
                <MessageSquareText size={19} className="text-[var(--sage)]" />
                <h3 className="serif mt-4 text-xl">{tone.label}</h3>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{tone.purpose}</p>
                <ul className="mt-4 space-y-2 text-xs">
                  {tone.traits.map((trait) => (
                    <li key={trait}>• {trait}</li>
                  ))}
                </ul>
                <p className="mt-4 border-t border-[var(--line)] pt-4 text-[11px] leading-5 text-[var(--muted)]">
                  {tone.guardrail}
                </p>
              </article>
            ))}
          </div>
        </section>

        <article className="flex flex-wrap items-center justify-between gap-5 rounded-3xl border border-[var(--line)] bg-white p-6 lg:p-8">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
              Put the controls into practice
            </p>
            <h2 className="serif mt-2 text-2xl">Choose a style and tone from an opportunity</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              The opportunity recommends the strongest initial style. A reviewer can override it and
              choose any approved tone before generation.
            </p>
          </div>
          <a
            href="/"
            className="flex items-center gap-2 rounded-xl bg-[var(--ink)] px-5 py-3 text-sm font-bold text-white"
          >
            Open Content inbox <ArrowRight size={17} />
          </a>
        </article>
      </section>
    </>
  );
}
