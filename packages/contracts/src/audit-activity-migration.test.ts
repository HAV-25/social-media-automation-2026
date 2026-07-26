import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "../../supabase/migrations/20260726185636_index_brand_audit_activity.sql"),
  "utf8",
);
const foreignKeyMigration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260726190123_index_audit_activity_foreign_keys.sql",
  ),
  "utf8",
);

describe("brand audit activity index", () => {
  it("indexes only the brand and time predicates used by the RLS-scoped activity query", () => {
    expect(migration).toContain("audit_logs_brand_created_idx");
    expect(migration).toContain("(brand_id, created_at desc)");
    expect(migration).toContain("where brand_id is not null");
    expect(migration).not.toContain("security definer");
  });

  it("covers both foreign keys used by activity attribution and brand isolation", () => {
    expect(foreignKeyMigration).toContain("audit_logs_brand_organization_idx");
    expect(foreignKeyMigration).toContain("(brand_id, organization_id)");
    expect(foreignKeyMigration).toContain("audit_logs_actor_idx");
    expect(foreignKeyMigration).toContain("(actor_id)");
  });
});
