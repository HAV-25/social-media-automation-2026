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
const freshReplayMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260728154533_replay_recoveries_with_fresh_signatures.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const secretKeyReplayMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260728162110_support_secret_keys_for_recovery_replays.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const freshIdempotencyMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260728212000_refresh_recovery_idempotency_keys.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const partialHandoffMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260729115000_resume_partial_editorial_handoffs.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const klaankPolicyReverificationMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260729133000_normalize_klaank_policy_and_reverify.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const recoveryCompletionMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260729141000_complete_accepted_recovery_replays.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const recoveryApplicationSource = readFileSync(
  fileURLToPath(new URL("../../../apps/web/lib/recovery.ts", import.meta.url)),
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
    expect(databaseTest).toContain("select plan(20)");
    expect(databaseTest).toContain("first retry uses deterministic one-minute backoff");
    expect(databaseTest).toContain("three-attempt cap");
    expect(databaseTest).toContain("brand editors cannot inspect");
    expect(databaseTest).toContain("administrator can queue one audited manual recovery");
    expect(databaseTest).toContain(
      "opaque service-role requests can claim recovery replays without legacy JWT claims",
    );
    expect(databaseTest).toContain("rollback;");
  });

  it("replays immutable typed requests with fresh workflow signatures", () => {
    expect(freshReplayMigration).toContain("private.claim_due_recovery_replays");
    expect(freshReplayMigration).toContain("context.request_payload");
    expect(freshReplayMigration).toContain("for update skip locked");
    expect(freshReplayMigration).toContain("recovery.fresh_replay_started");
    expect(freshReplayMigration).toContain("workflow_execution_contexts_activate_replay");
    expect(freshReplayMigration).not.toContain("N8N_API_KEY");
  });

  it("authorizes opaque Supabase secret keys before entering the definer", () => {
    expect(secretKeyReplayMigration).toContain("if current_user <> 'service_role'");
    expect(secretKeyReplayMigration).toContain(
      "set_config('request.jwt.claim.role', 'service_role', true)",
    );
    expect(secretKeyReplayMigration).toContain(
      "from private.claim_due_recovery_replays(requested_limit)",
    );
    expect(secretKeyReplayMigration).toContain("from public, anon, authenticated");
    expect(secretKeyReplayMigration).toContain("to service_role");
    expect(secretKeyReplayMigration).not.toContain("security definer");
  });

  it("gives each recovery attempt a fresh bounded idempotency identity", () => {
    expect(freshIdempotencyMigration).toContain("format(\n          'wf10-replay:%s:%s'");
    expect(freshIdempotencyMigration).toContain("claimed.recovery_id");
    expect(freshIdempotencyMigration).toContain("claimed.attempt_count");
    expect(freshIdempotencyMigration).toContain(
      "active_run.error ->> 'code' = 'research_already_running'",
    );
    expect(freshIdempotencyMigration).toContain("recovery.attempt_count < recovery.max_attempts");
    expect(freshIdempotencyMigration).toContain("from public, anon, authenticated");
    expect(freshIdempotencyMigration).toContain("to service_role");
    expect(freshIdempotencyMigration).not.toContain("security definer");
  });

  it("reconciles proven research success and resumes only bounded partial handoffs", () => {
    expect(partialHandoffMigration).toContain("research.status = 'succeeded'");
    expect(partialHandoffMigration).toContain("active_run.error ->> 'code' = 'invalid_output'");
    expect(partialHandoffMigration).toContain("error_code = 'verification_handoff_missing'");
    expect(partialHandoffMigration).toContain("recovery.attempt_count < recovery.max_attempts");
    expect(partialHandoffMigration).toContain("recovery.created_at >= now() - interval '48 hours'");
    expect(partialHandoffMigration).toContain("verification.run_type = 'post_verification'");
  });

  it("normalizes phrase-level Klaank restrictions and re-verifies only affected drafts", () => {
    expect(klaankPolicyReverificationMigration).toContain("brand.slug = 'klaank'");
    expect(klaankPolicyReverificationMigration).toContain(
      "'Unverified safety, compliance, legal, or investment claims'",
    );
    expect(klaankPolicyReverificationMigration).toContain(
      "draft.score_breakdown #> '{evaluation,restrictedTopics}'",
    );
    expect(klaankPolicyReverificationMigration).toContain("recovery.target = 'post_verification'");
    expect(klaankPolicyReverificationMigration).toContain(
      "error_code = 'brand_policy_reverification'",
    );
    expect(klaankPolicyReverificationMigration).toContain(
      "recovery.created_at >= now() - interval '48 hours'",
    );
  });

  it("atomically completes accepted synchronous recovery replays", () => {
    expect(recoveryCompletionMigration).toContain(
      "create or replace function public.complete_recovery_replay",
    );
    expect(recoveryCompletionMigration).toContain("if current_user <> 'service_role'");
    expect(recoveryCompletionMigration).toContain("recovery_record.status <> 'dispatching'");
    expect(recoveryCompletionMigration).toContain("run_record.status <> 'queued'");
    expect(recoveryCompletionMigration).toContain("'recovery.replay_completed'");
    expect(recoveryCompletionMigration).toContain("from public, anon, authenticated");
    expect(recoveryCompletionMigration).toContain("to service_role");
    expect(recoveryCompletionMigration).toContain(
      "'{\"reconciledFromDurableStageSuccess\":true}'::jsonb",
    );
    expect(recoveryApplicationSource).toContain('.rpc("complete_recovery_replay"');
    expect(recoveryApplicationSource).toContain('code: "recovery_completion_persistence_failed"');
  });
});
