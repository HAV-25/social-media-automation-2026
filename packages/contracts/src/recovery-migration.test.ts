import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL("../../../supabase/migrations/20260724183139_run_recovery.sql", import.meta.url),
  ),
  "utf8",
);
const databaseTest = readFileSync(
  fileURLToPath(new URL("../../../supabase/tests/database/run_recovery.test.sql", import.meta.url)),
  "utf8",
);

describe("run recovery database contract", () => {
  it("commits a tenant-scoped RLS-protected recovery state machine", () => {
    expect(migration).toContain("create table public.run_recoveries");
    expect(migration).toContain("alter table public.run_recoveries enable row level security");
    expect(migration).toMatch(
      /create policy run_recoveries_select[\s\S]*?public\.can_manage_organization/,
    );
    expect(migration).toContain("create table private.workflow_execution_contexts");
    expect(migration).toContain("workflow_execution_contexts_recovery_idx");
    expect(migration).toContain(
      "revoke all on private.workflow_execution_contexts from public, anon, authenticated",
    );
  });

  it("caps, leases, redacts, and atomically claims automatic retries", () => {
    expect(migration).toContain("attempt_count between 0 and 3");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("lease_expires_at = now() + interval '5 minutes'");
    expect(migration).toContain("code_value !~ '^[a-z0-9_.:-]{1,120}$'");
    expect(migration).not.toMatch(/raw_error|error_message|provider_response/);
    expect(migration).toContain("Workflow execution was reused with a different request");
  });

  it("tests idempotency, backoff, cap, dead letter, RLS, and manual override", () => {
    expect(databaseTest).toContain("select plan(19)");
    expect(databaseTest).toContain("first retry uses deterministic one-minute backoff");
    expect(databaseTest).toContain("three-attempt cap");
    expect(databaseTest).toContain("brand editors cannot inspect");
    expect(databaseTest).toContain("administrator can queue one audited manual recovery");
    expect(databaseTest).toContain("rollback;");
  });
});
