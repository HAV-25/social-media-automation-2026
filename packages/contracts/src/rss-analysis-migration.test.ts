import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const initialMigration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260723125216_initial_tenancy_and_content_schema.sql",
  ),
  "utf8",
);
const compatibilityMigration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260725173500_allow_rss_analysis_source_type.sql",
  ),
  "utf8",
);

describe("RSS analysis persistence migration", () => {
  it("permits RSS in fresh ingest_manual_input installations", () => {
    expect(initialMigration).toMatch(/'plain_text',\s+'rss',\s+'url'/);
    expect(initialMigration).toContain(
      "case when (payload ->> 'sourceType') = 'rss' then 'rss_analysis'",
    );
  });

  it("patches deployed definitions defensively without changing grants", () => {
    expect(compatibilityMigration).toContain(
      "pg_get_functiondef('private.ingest_manual_input(jsonb)'::regprocedure)",
    );
    expect(compatibilityMigration).toContain("''plain_text'',\\n      ''rss'',\\n      ''url''");
    expect(compatibilityMigration).toContain("if updated_definition = function_definition");
    expect(compatibilityMigration).toContain(
      "Expected ingest_manual_input source-type allowlist was not found",
    );
    expect(compatibilityMigration).not.toMatch(/\bgrant\b|\brevoke\b/i);
  });
});
