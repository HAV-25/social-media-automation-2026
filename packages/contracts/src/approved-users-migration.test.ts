import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "../../supabase/migrations/20260725105435_approved_internal_users.sql"),
  "utf8",
);

describe("approved internal users migration", () => {
  it("keeps the allowlist private, RLS-enabled, and ungranted", () => {
    expect(migration).toContain("create table private.approved_internal_users");
    expect(migration).toContain(
      "alter table private.approved_internal_users enable row level security",
    );
    expect(migration).toContain(
      "revoke all on private.approved_internal_users from public, anon, authenticated",
    );
    expect(migration).not.toMatch(/grant\s+.+approved_internal_users/i);
  });

  it("normalizes and bounds approved email identities", () => {
    expect(migration).toContain("email = lower(btrim(email))");
    expect(migration).toContain("char_length(email) between 3 and 254");
    expect(migration).toContain("approved_internal_users_email_active_idx");
  });

  it("provisions only confirmed, active, exact-email matches", () => {
    expect(migration).toContain("u.email_confirmed_at is not null");
    expect(migration).toContain("approved.email = v_email");
    expect(migration).toContain("and approved.active");
    expect(migration).toContain("brand.status = 'active'");
  });

  it("gives approved pilot users unrestricted administrator access", () => {
    expect(migration).toContain("role public.organization_role not null default 'administrator'");
    expect(migration).toContain(
      "insert into public.organization_members (organization_id, user_id, role)",
    );
    expect(migration).toContain("insert into public.brand_members (brand_id, user_id, role)");
    expect(migration).toContain("do update set role = excluded.role");
  });

  it("uses hardened private security-definer trigger functions", () => {
    expect(migration.match(/security definer/g)?.length).toBe(4);
    expect(migration.match(/set search_path = ''/g)?.length).toBe(4);
    expect(migration.match(/revoke all on function private\./g)?.length).toBe(4);
    expect(migration).toContain("on auth.users");
    expect(migration).toContain("on private.approved_internal_users");
  });

  it("preserves idempotency and audit provenance", () => {
    expect(migration).toContain("on conflict (organization_id, user_id)");
    expect(migration).toContain("on conflict (brand_id, user_id)");
    expect(migration).toContain("'approved_user_provisioned'");
    expect(migration).toContain("'private_email_allowlist'");
  });
});
