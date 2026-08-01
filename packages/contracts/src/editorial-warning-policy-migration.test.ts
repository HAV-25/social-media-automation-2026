import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260801091147_allow_audited_editorial_warning_overrides.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("audited editorial warning override migration", () => {
  it("keeps structural validation while removing only readiness boolean gates", () => {
    expect(migration).toContain("private.create_evaluated_draft(jsonb)");
    expect(migration).toContain("private.persist_research_evidence(jsonb)");
    expect(migration).toContain("private.persist_image_asset(jsonb)");
    expect(migration).toContain("private.assert_editorial_evaluation");
    expect(migration).toContain("current_post_status <> ''ready_for_review''");
    expect(migration).not.toContain("drop constraint");
    expect(migration).not.toContain("disable row level security");
  });

  it("requires an exact warning snapshot, acknowledgement, and reviewer reason", () => {
    expect(migration).toContain("warningsAcknowledged");
    expect(migration).toContain("Editorial warning snapshot is stale");
    expect(migration).toContain("approval_warning_acknowledged");
    expect(migration).toContain("post.approval_warning_acknowledged");
    expect(migration).toContain(
      "char_length(coalesce(payload ->> 'reason', '')) not between 10 and 2000",
    );
  });

  it("retains service-only execution on the privileged review function", () => {
    expect(migration).toContain("current_setting('request.jwt.claims', true)");
    expect(migration).not.toContain("current_setting('request.jwt.claim.role', true)");
    expect(migration).toContain(
      "revoke all on function private.review_evaluated_post(jsonb)\n  from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function private.review_evaluated_post(jsonb) to service_role;",
    );
  });
});
