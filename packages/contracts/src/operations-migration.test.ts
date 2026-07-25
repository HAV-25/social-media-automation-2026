import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const operationsMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260724180022_operations_run_indexes.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const initialSchema = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260723125216_initial_tenancy_and_content_schema.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const tenancyTest = readFileSync(
  fileURLToPath(new URL("../../../supabase/tests/database/tenancy_rls.test.sql", import.meta.url)),
  "utf8",
);

describe("operations observability database contract", () => {
  it("supports brand-scoped cursor, status, type, and stage lookups", () => {
    expect(operationsMigration).toContain("generation_runs_brand_created_cursor_idx");
    expect(operationsMigration).toContain(
      "on public.generation_runs (brand_id, status, created_at desc, id desc)",
    );
    expect(operationsMigration).toContain(
      "on public.generation_runs (brand_id, run_type, created_at desc, id desc)",
    );
    expect(operationsMigration).toContain(
      "on public.pipeline_events (generation_run_id, created_at desc, id desc)",
    );
  });

  it("retains RLS and brand-authorized read policies on both observable tables", () => {
    expect(initialSchema).toContain("alter table public.generation_runs enable row level security");
    expect(initialSchema).toContain("alter table public.pipeline_events enable row level security");
    expect(initialSchema).toMatch(
      /create policy generation_runs_select[\s\S]*?public\.can_read_brand\(brand_id\)/,
    );
    expect(initialSchema).toMatch(
      /create policy pipeline_events_select[\s\S]*?public\.can_read_brand\(brand_id\)/,
    );
  });

  it("commits cross-organization and cross-brand read-denial fixtures", () => {
    expect(tenancyTest).toContain("select plan(22)");
    expect(tenancyTest).toContain(
      "organization administrator reads only runs in their organization",
    );
    expect(tenancyTest).toContain("brand editor reads only runs for their assigned brand");
    expect(tenancyTest).toContain(
      "brand editor reads only pipeline events for their assigned brand",
    );
    expect(tenancyTest).toContain("rollback;");
  });
});
