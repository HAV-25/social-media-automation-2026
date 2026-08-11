import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260811122309_lightweight_pipeline_control_plane.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("lightweight pipeline control plane", () => {
  it("creates RLS-protected summaries and keeps job payloads private", () => {
    expect(migration).toContain("create table public.pipeline_instances");
    expect(migration).toContain("create table public.pipeline_jobs");
    expect(migration).toContain("create table private.pipeline_job_payloads");
    expect(migration).toContain("alter table public.pipeline_instances enable row level security");
    expect(migration).toContain("alter table public.pipeline_jobs enable row level security");
    expect(migration).toContain("public.can_read_brand(brand_id)");
    expect(migration).toContain(
      "revoke all on private.pipeline_job_payloads from public, anon, authenticated",
    );
  });

  it("claims work atomically with leases and bounded retries", () => {
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("requested_lease_seconds not between 30 and 1800");
    expect(migration).toContain("attempt < job.max_attempts");
    expect(migration).toContain("least(3600, 30 * power(2");
    expect(migration).toContain("Idempotency key reused with different payload");
  });

  it("authorizes opaque service keys before entering definer functions", () => {
    expect(migration).toContain("if current_user <> 'service_role'");
    expect(migration).toContain("create or replace function public.claim_pipeline_jobs");
    expect(migration).toContain("create or replace function private.claim_pipeline_jobs");
    expect(migration).toContain("grant execute on function public.claim_pipeline_jobs");
  });

  it("limits exposed SECURITY DEFINER wrappers to audited reviewer entry points", () => {
    const definitions = [
      ...migration.matchAll(/create or replace function ([a-z_]+\.[a-z_]+)[\s\S]*?\$\$;/g),
    ].filter((match) => /security definer/i.test(match[0]));
    expect(definitions.length).toBeGreaterThan(5);
    const exposed = definitions
      .map((match) => match[1])
      .filter((name) => name?.startsWith("public."));
    expect(exposed).toEqual([
      "public.request_lightweight_action",
      "public.save_lightweight_post_edit",
      "public.review_lightweight_post",
    ]);
    expect(migration).not.toMatch(/grant execute on function private\.[^\n]+ to authenticated/);
  });

  it("exposes narrow authenticated reviewer actions with audit records", () => {
    expect(migration).toContain("private.can_edit_brand(target_brand_id)");
    expect(migration).toContain("create or replace function public.request_lightweight_action");
    expect(migration).toContain("create or replace function public.save_lightweight_post_edit");
    expect(migration).toContain("create or replace function public.review_lightweight_post");
    expect(migration).toContain("grant execute on function public.review_lightweight_post");
    expect(migration).toContain("insert into public.audit_logs");
  });
});
