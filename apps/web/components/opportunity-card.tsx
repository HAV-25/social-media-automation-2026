import { ArrowUpRight, CheckCircle2, Clock3, Layers3, ShieldAlert } from "lucide-react";

export type Opportunity = {
  id: string;
  score: number;
  source: string;
  age: string;
  title: string;
  nucleus: string;
  style: string;
  corroboration: number;
  risk: string;
};

export function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  return (
    <article className="paper-shadow group rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 transition hover:-translate-y-0.5 hover:border-[#bdb7ac]">
      <div className="flex gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--sage-soft)]">
          <span className="serif text-2xl font-bold text-[var(--sage)]">{opportunity.score}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
            <span className="font-bold tracking-wide text-[var(--sage)] uppercase">
              {opportunity.source}
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Clock3 size={12} /> {opportunity.age}
            </span>
          </div>
          <h3 className="serif mt-2 text-2xl leading-7 tracking-[-0.02em]">{opportunity.title}</h3>
        </div>
        <ArrowUpRight className="text-[var(--muted)] transition group-hover:text-[var(--accent)]" />
      </div>

      <div className="mt-5 border-l-2 border-[var(--accent)] pl-4">
        <p className="text-[10px] font-bold tracking-[0.16em] text-[var(--muted)] uppercase">
          Value nucleus
        </p>
        <p className="mt-1 text-sm leading-6">{opportunity.nucleus}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4 text-xs">
        <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 font-semibold text-[#8b321c]">
          {opportunity.style}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-stone-100 px-3 py-1.5 text-[var(--muted)]">
          <Layers3 size={13} /> {opportunity.corroboration} sources
        </span>
        <span className="flex items-center gap-1 rounded-full bg-stone-100 px-3 py-1.5 text-[var(--muted)]">
          {opportunity.risk === "Low" ? <CheckCircle2 size={13} /> : <ShieldAlert size={13} />}
          {opportunity.risk} risk
        </span>
        <a
          href={`/opportunities/${opportunity.id}`}
          className="ml-auto rounded-lg bg-[var(--ink)] px-4 py-2 font-semibold text-white transition hover:bg-[var(--sage)]"
        >
          Review opportunity
        </a>
      </div>
    </article>
  );
}
