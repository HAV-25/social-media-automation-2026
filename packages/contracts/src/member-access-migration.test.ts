import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260726191319_manage_organization_members.sql",
  ),
  "utf8",
);
const indexMigration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260726192435_index_organization_member_user.sql",
  ),
  "utf8",
);

describe("organization member access migration", () => {
  it("keeps the mutation invoker-scoped, administrator-authorized and explicitly granted", () => {
    expect(migration).toContain("function public.manage_organization_member_access(payload jsonb)");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("not public.can_manage_organization(target_organization_id)");
    expect(migration).toContain(
      "revoke all on function public.manage_organization_member_access(jsonb)",
    );
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated");
  });

  it("validates and bounds every member and brand assignment field", () => {
    expect(migration).toContain("jsonb_array_length");
    expect(migration).toContain("> 20");
    expect(migration).toContain("count(distinct assignment.value ->> 'brandId')");
    expect(migration).toContain("brand.organization_id = target_organization_id");
    expect(migration).toContain("brand.status = 'active'");
  });

  it("replaces assignments and records the human change in one function transaction", () => {
    expect(migration).toContain("delete from public.brand_members");
    expect(migration).toContain("insert into public.brand_members");
    expect(migration).toContain("'organization_member.access_updated'");
    expect(migration).toContain("update public.organization_members");
  });

  it("protects the last administrator at the database boundary", () => {
    expect(migration).toContain("organization_members_protect_last_administrator");
    expect(migration).toContain("The organization must retain at least one administrator");
    expect(migration).toContain("other_member.role = 'administrator'");
  });

  it("adds organization-visible email without exposing auth users", () => {
    expect(migration).toContain("add column if not exists email text");
    expect(migration).toContain("insert into public.profiles (user_id, display_name, email)");
    expect(migration).toContain("do update set email = excluded.email");
    expect(migration).not.toMatch(/grant .*auth\.users/i);
  });

  it("covers organization role and user access paths", () => {
    expect(migration).toContain("organization_members_org_role_idx");
    expect(migration).toContain("(organization_id, role)");
    expect(indexMigration).toContain("organization_members_user_idx");
    expect(indexMigration).toContain("(user_id)");
  });
});
