import { ArrowLeft, BookOpenCheck, CircleAlert, ExternalLink, ShieldCheck } from "lucide-react";
import { DraftGenerator } from "@/components/draft-generator";
import { ResearchPanel } from "@/components/research-panel";
import { notFound } from "next/navigation";
import { getOpportunityDetail } from "@/lib/opportunity-detail";
import { getResearchEvidence } from "@/lib/research";

export const dynamic = "force-dynamic";

function styleLabel(value: string) {
  return (
    {
      newsworthy_authority: "Newsworthy Authority",
      educational_breakdown: "Educational Breakdown",
      perspective_conversation: "Perspective & Conversation",
    }[value] ?? value
  );
}

export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  const opportunity = await getOpportunityDetail(opportunityId);
  if (!opportunity) notFound();
  const research = await getResearchEvidence(opportunityId);

  return (
    <>
      <header className="flex flex-wrap items-center gap-4 border-b border-[var(--line)] bg-[var(--canvas)]/90 px-6 py-5 backdrop-blur lg:px-10">
        <a
          href="/"
          className="grid size-9 place-items-center rounded-xl border border-[var(--line)] bg-white text-[var(--muted)]"
          aria-label="Back to content inbox"
        >
          <ArrowLeft size={17} />
        </a>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
            Opportunity detail
          </p>
          <h1 className="serif mt-1 truncate text-3xl tracking-[-0.03em]">{opportunity.title}</h1>
        </div>
        <span className="rounded-full bg-[var(--sage-soft)] px-3 py-1.5 text-xs font-bold text-[var(--sage)]">
          {styleLabel(opportunity.recommendedStyle)}
        </span>
      </header>

      <section className="px-6 py-8 lg:px-10 lg:py-10">
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6 lg:p-8">
              <div className="flex flex-wrap items-center gap-5">
                <div className="grid size-24 place-items-center rounded-3xl bg-[var(--sage)] text-white">
                  <span className="serif text-4xl font-bold">{opportunity.score.toFixed(0)}</span>
                  <span className="-mt-7 text-[9px] font-bold tracking-wide text-white/55 uppercase">
                    of 100
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold tracking-[0.18em] text-[var(--muted)] uppercase">
                    Value nucleus
                  </p>
                  <p className="serif mt-2 text-2xl leading-8">{opportunity.valueNucleus}</p>
                </div>
              </div>
              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-stone-50 p-4">
                  <p className="text-[10px] font-bold text-[var(--muted)] uppercase">Source</p>
                  <p className="mt-1 text-sm font-bold capitalize">
                    {opportunity.sourceType.replaceAll("_", " ")}
                  </p>
                </div>
                <div className="rounded-xl bg-stone-50 p-4">
                  <p className="text-[10px] font-bold text-[var(--muted)] uppercase">Language</p>
                  <p className="mt-1 text-sm font-bold uppercase">{opportunity.language}</p>
                </div>
                <div className="rounded-xl bg-stone-50 p-4">
                  <p className="text-[10px] font-bold text-[var(--muted)] uppercase">
                    Pipeline state
                  </p>
                  <p className="mt-1 text-sm font-bold capitalize">{opportunity.status}</p>
                </div>
              </div>
              {opportunity.topicTags.length || opportunity.namedEntities.length ? (
                <div className="mt-5 grid gap-4 border-t border-[var(--line)] pt-5 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold text-[var(--muted)] uppercase">
                      Topic tags
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {opportunity.topicTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-[var(--sage-soft)] px-2.5 py-1 text-xs font-bold text-[var(--sage)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-[var(--muted)] uppercase">
                      Named entities
                    </p>
                    <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                      {opportunity.namedEntities.join(" · ") || "None detected"}
                    </p>
                  </div>
                </div>
              ) : null}
              {opportunity.classificationReasons.length ? (
                <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
                  Style rationale: {opportunity.classificationReasons.join("; ")}.
                </p>
              ) : null}
            </section>

            <section className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6 lg:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold tracking-[0.16em] text-[var(--sage)] uppercase">
                    Explainable arithmetic
                  </p>
                  <h2 className="serif mt-2 text-2xl">Why this opportunity scored here</h2>
                </div>
                <BookOpenCheck className="text-[var(--sage)]" />
              </div>
              <div className="mt-6 space-y-5">
                {opportunity.dimensions.map((dimension) => (
                  <div key={dimension.key}>
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <strong>{dimension.label}</strong>
                      <span className="font-bold text-[var(--sage)]">
                        {dimension.score.toFixed(1)} / {dimension.maximum}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]"
                        style={{
                          width: `${Math.min(100, (dimension.score / dimension.maximum) * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">
                      {dimension.reason}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {research ? (
              <section className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6 lg:p-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold tracking-[0.16em] text-[var(--sage)] uppercase">
                      Evidence package
                    </p>
                    <h2 className="serif mt-2 text-2xl">Claims ledger</h2>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      research.evidencePackage.readyForWriting
                        ? "bg-[var(--sage-soft)] text-[var(--sage)]"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {research.evidencePackage.readyForWriting
                      ? "Ready for writing"
                      : "Prepared with evidence warnings"}
                  </span>
                </div>
                {research.simulated ? (
                  <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
                    Development simulation: this package proves the workflow without making a paid
                    web-research call. It must not be described as external verification.
                  </div>
                ) : null}
                <p className="mt-5 text-sm leading-6 text-[var(--muted)]">
                  {research.evidencePackage.summary}
                </p>
                <div className="mt-6 space-y-4">
                  {research.evidencePackage.claims.map((claim) => (
                    <article
                      key={claim.claimKey}
                      className="rounded-2xl border border-[var(--line)] p-5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase">
                          {claim.claimType}
                        </span>
                        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase">
                          {claim.importance}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase ${
                            claim.usageGuidance === "safe"
                              ? "bg-emerald-100 text-emerald-800"
                              : claim.usageGuidance === "do_not_use"
                                ? "bg-red-100 text-red-800"
                                : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {claim.verificationState.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-bold leading-6">{claim.text}</p>
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        Confidence {(claim.confidence * 100).toFixed(0)}% · risk {claim.riskLevel} ·{" "}
                        {claim.usageGuidance.replaceAll("_", " ")}
                      </p>
                      {claim.caveat ? (
                        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                          {claim.caveat}
                        </p>
                      ) : null}
                      {claim.evidence.length ? (
                        <div className="mt-4 space-y-2">
                          {claim.evidence.map((evidence, index) => {
                            const source = research.evidencePackage.sources.find(
                              (candidate) => candidate.sourceKey === evidence.sourceKey,
                            );
                            return (
                              <div
                                key={`${evidence.sourceKey}-${index}`}
                                className="rounded-xl bg-stone-50 p-3 text-xs leading-5"
                              >
                                <strong className="capitalize">
                                  {evidence.supportType}
                                  {source ? ` · ${source.publisher}` : ""}
                                </strong>
                                <p className="mt-1 text-[var(--muted)]">{evidence.excerpt}</p>
                                {source ? (
                                  <a
                                    href={source.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-2 inline-flex items-center gap-1 font-bold text-[var(--accent)]"
                                  >
                                    Inspect source <ExternalLink size={12} />
                                  </a>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
                {research.evidencePackage.conflicts.length ? (
                  <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
                    <h3 className="text-sm font-bold text-red-950">Material conflicts</h3>
                    {research.evidencePackage.conflicts.map((conflict) => (
                      <div
                        key={conflict.conflictKey}
                        className="mt-3 text-xs leading-5 text-red-900"
                      >
                        <strong>{conflict.description}</strong>
                        <p>{conflict.resolution}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-5 text-xs text-[var(--muted)]">
                  <ShieldCheck size={15} />
                  <span>
                    {research.model} · {research.promptVersion} · {research.usage.webSearchCalls}{" "}
                    search call
                    {research.usage.webSearchCalls === 1 ? "" : "s"} · $
                    {research.usage.estimatedCostUsd.toFixed(4)}
                  </span>
                </div>
              </section>
            ) : null}

            <details className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6 lg:p-8">
              <summary className="cursor-pointer text-sm font-bold">
                Inspect normalized source
              </summary>
              <div className="mt-5 whitespace-pre-wrap rounded-2xl bg-stone-50 p-5 text-sm leading-7 text-stone-700">
                {opportunity.cleanText}
              </div>
            </details>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6">
            <section
              className={`rounded-3xl p-6 ${
                opportunity.riskPenalty > 0
                  ? "border border-amber-200 bg-amber-50"
                  : "bg-[var(--sage-soft)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold tracking-[0.18em] uppercase">Risk penalty</p>
                <CircleAlert size={18} />
              </div>
              <strong className="serif mt-3 block text-4xl">
                −{opportunity.riskPenalty.toFixed(0)}
              </strong>
              {opportunity.riskReasons.length ? (
                <ul className="mt-4 space-y-2 text-xs leading-5">
                  {opportunity.riskReasons.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                  No deterministic restricted-topic or certainty-language penalty was applied.
                </p>
              )}
            </section>

            <ResearchPanel opportunityId={opportunity.id} hasEvidence={Boolean(research)} />

            <DraftGenerator
              opportunityId={opportunity.id}
              defaultStyle={opportunity.recommendedStyle}
              hasEvidence={Boolean(research)}
            />
          </aside>
        </div>
      </section>
    </>
  );
}
