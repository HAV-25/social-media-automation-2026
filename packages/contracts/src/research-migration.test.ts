import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260723201500_research_evidence_ledger.sql",
    import.meta.url,
  ),
);
const sql = readFileSync(migrationPath, "utf8");
const countQualificationMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260725210500_qualify_research_ledger_counts.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const statusCastMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260725211000_cast_research_opportunity_status.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const readinessRepairMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260726143500_recompute_quarantined_claim_readiness.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const quarantinedClaimIntegrityMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260728102202_align_quarantined_research_claim_integrity.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("research evidence ledger migration", () => {
  it("adds a normalized conflict ledger with immediate RLS", () => {
    expect(sql).toContain("create table public.claim_conflicts");
    expect(sql).toContain("create table public.claim_conflict_members");
    expect(sql).toContain("alter table public.claim_conflicts enable row level security");
    expect(sql).toContain("alter table public.claim_conflict_members enable row level security");
    expect(sql).toContain("create policy claim_conflicts_update");
    expect(sql).toContain("with check");
  });

  it("keeps atomic evidence persistence private and service-only", () => {
    expect(sql).toContain("create or replace function private.reserve_research_budget");
    expect(sql).toContain("create or replace function private.persist_research_evidence");
    expect(sql).toContain("create or replace function private.fail_research_run");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain(
      "grant execute on function public.persist_research_evidence(jsonb) to service_role",
    );
    expect(sql).not.toContain(
      "grant execute on function public.persist_research_evidence(jsonb) to authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.reserve_research_budget(jsonb) to service_role",
    );
  });

  it("defends provenance, risk, readiness, and idempotency in the database transaction", () => {
    expect(sql).toContain("Research evidence integrity check failed");
    expect(sql).toContain("evidence.value ->> 'sourceKey'");
    expect(sql).toContain("claim.value ->> 'verificationState' = 'verified'");
    expect(sql).toContain("claim.value ->> 'usageGuidance' <> 'do_not_use'");
    expect(sql).toContain("is_ready and jsonb_array_length(package -> 'claims') = 0");
    expect(sql).toContain("scope = 'research_evidence'");
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(sql).toContain("Daily AI research budget exhausted");
    expect(sql).toContain("research.evidence_persisted");
    expect(sql).toContain("provider_response_id");
  });

  it("qualifies ledger count predicates for fresh and existing databases", () => {
    expect(sql).toContain("counted_source.research_run_id = research_id");
    expect(sql).toContain("counted_claim.research_run_id = research_id");
    expect(countQualificationMigration).toContain(
      "'private.persist_research_evidence(jsonb)'::regprocedure",
    );
    expect(countQualificationMigration).toContain("counted_source.research_run_id = research_id");
    expect(countQualificationMigration).toContain("counted_claim.research_run_id = research_id");
  });

  it("casts research opportunity transitions to the durable enum", () => {
    expect(sql).toContain("'ready_to_generate'::public.opportunity_status");
    expect(sql).toContain("'research_pending'::public.opportunity_status");
    expect(statusCastMigration).toContain(
      "'private.persist_research_evidence(jsonb)'::regprocedure",
    );
    expect(statusCastMigration).toContain("::public.opportunity_status");
  });

  it("repairs readiness only when usable core evidence has no writable blocker", () => {
    expect(readinessRepairMigration).toContain("claim.usage_guidance::text <> 'do_not_use'");
    expect(readinessRepairMigration).toContain(
      "claim.verification_state::text not in ('unsupported', 'disputed')",
    );
    expect(readinessRepairMigration).toContain(
      "claim.verification_state::text in ('unsupported', 'disputed')",
    );
    expect(readinessRepairMigration).toContain("set status = 'ready_to_generate'");
    expect(readinessRepairMigration).toContain("'research.readiness_recomputed'");
  });

  it("does not let quarantined claims veto separately usable research evidence", () => {
    expect(quarantinedClaimIntegrityMigration).toContain(
      "'private.persist_research_evidence(jsonb)'::regprocedure",
    );
    expect(quarantinedClaimIntegrityMigration).toContain(
      "claim.value ->> ''usageGuidance'' <> ''do_not_use''",
    );
    expect(quarantinedClaimIntegrityMigration).toContain(
      "claim.value ->> ''verificationState'' in (''unsupported'', ''disputed'')",
    );
    expect(quarantinedClaimIntegrityMigration).toContain(
      "Expected unqualified research readiness blocker was not found",
    );
  });
});
