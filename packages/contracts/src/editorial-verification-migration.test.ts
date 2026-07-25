import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/20260724111716_verify_editorial_post.sql", import.meta.url),
);
const sql = readFileSync(migrationPath, "utf8");

describe("editorial verification migration", () => {
  it("checks actor permissions, current version, and evaluation integrity", () => {
    expect(sql).toContain("Brand editor permission required");
    expect(sql).toContain("current_version_id is distinct from expected_version_id");
    expect(sql).toContain("private.assert_editorial_evaluation");
    expect(sql).toContain("Terminal posts cannot be reverified");
  });

  it("persists claim mappings and zero-cost verification provenance", () => {
    expect(sql).toContain("delete from public.post_claims");
    expect(sql).toContain("insert into public.post_claims");
    expect(sql).toContain("'post.verified'");
    expect(sql).toContain("'provider', 'deterministic'");
    expect(sql).toContain("'costUsd', 0");
  });

  it("is idempotent and callable only by the service role", () => {
    expect(sql).toContain("scope = 'post_verification'");
    expect(sql).toContain("Idempotency key was reused with a different request");
    expect(sql).toContain(
      "grant execute on function public.verify_evaluated_post(jsonb) to service_role",
    );
    expect(sql).not.toContain(
      "grant execute on function public.verify_evaluated_post(jsonb) to authenticated",
    );
  });
});
