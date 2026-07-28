import { z } from "zod";

export const deferredOpportunityRowSchema = z.object({
  id: z.uuid(),
  source_document_id: z.uuid(),
  opportunity_score: z.coerce.number().min(0).max(100),
  status: z.enum(["candidate", "ready_to_generate"]),
  created_at: z.iso.datetime({ offset: true }),
});

type DeferredOpportunityRow = z.infer<typeof deferredOpportunityRowSchema>;

type DeferredGenerationRun = {
  id: string;
  entity_id: string;
  run_type: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
};

export function classifyDeferredRssProgress(input: {
  draftedOpportunityIds: Iterable<string>;
  runs: DeferredGenerationRun[];
}) {
  const existingReservationByOpportunity = new Map(
    input.runs
      .filter((run) => run.run_type === "rss_opportunity_reservation" && run.status === "succeeded")
      .map((run) => [run.entity_id, run.id]),
  );
  const blockedOpportunityIds = new Set(input.draftedOpportunityIds);
  for (const run of input.runs) {
    if (run.run_type !== "rss_opportunity_reservation") {
      blockedOpportunityIds.add(run.entity_id);
    }
  }
  return { blockedOpportunityIds, existingReservationByOpportunity };
}

export function selectDeferredRssCandidates(input: {
  opportunities: DeferredOpportunityRow[];
  blockedOpportunityIds: ReadonlySet<string>;
  rssSourceDocumentIds: ReadonlySet<string>;
  requestedAt: string;
  maximumAgeHours?: number;
}) {
  const requestedAt = new Date(input.requestedAt);
  if (!Number.isFinite(requestedAt.getTime())) {
    throw new Error("Deferred RSS sweep time is invalid.");
  }
  const maximumAgeHours = input.maximumAgeHours ?? 24;
  if (!Number.isInteger(maximumAgeHours) || maximumAgeHours < 1 || maximumAgeHours > 168) {
    throw new Error("Deferred RSS maximum age is invalid.");
  }
  const cutoff = requestedAt.getTime() - maximumAgeHours * 60 * 60 * 1_000;

  return input.opportunities
    .filter(
      (opportunity) =>
        input.rssSourceDocumentIds.has(opportunity.source_document_id) &&
        !input.blockedOpportunityIds.has(opportunity.id) &&
        new Date(opportunity.created_at).getTime() >= cutoff,
    )
    .sort(
      (left, right) =>
        right.opportunity_score - left.opportunity_score ||
        left.created_at.localeCompare(right.created_at) ||
        left.id.localeCompare(right.id),
    );
}
