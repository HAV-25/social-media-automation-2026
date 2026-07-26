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
const rescoreMigration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260726145500_rescore_enriched_rss_opportunities.sql",
  ),
  "utf8",
);
const automaticScoreFloorMigration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260726151000_enforce_automatic_score_floor.sql",
  ),
  "utf8",
);

describe("RSS analysis persistence migration", () => {
  it("permits RSS in fresh ingest_manual_input installations", () => {
    expect(initialMigration).toMatch(/'plain_text',\s+'rss',\s+'url'/);
    expect(initialMigration).toContain("#variable_conflict use_column");
    expect(initialMigration).toContain(
      "case when (payload ->> 'sourceType') = 'rss' then 'rss_analysis'",
    );
  });

  it("patches deployed definitions defensively without changing grants", () => {
    expect(compatibilityMigration).toContain(
      "pg_get_functiondef('private.ingest_manual_input(jsonb)'::regprocedure)",
    );
    expect(compatibilityMigration).toContain("''plain_text'',\\n      ''rss'',\\n      ''url''");
    expect(compatibilityMigration).toContain("#variable_conflict use_column");
    expect(compatibilityMigration).toContain("if updated_definition = function_definition");
    expect(compatibilityMigration).toContain(
      "Expected ingest_manual_input source-type allowlist was not found",
    );
    expect(compatibilityMigration).not.toMatch(/\bgrant\b|\brevoke\b/i);
  });

  it("refreshes deterministic scores when an RSS summary is enriched", () => {
    for (const sql of [initialMigration, rescoreMigration]) {
      expect(sql).toContain("opportunity_score = excluded.opportunity_score");
      expect(sql).toContain("risk_penalty = excluded.risk_penalty");
      expect(sql).toContain("score_breakdown = excluded.score_breakdown");
      expect(sql).toContain("value_nucleus = excluded.value_nucleus");
    }
    expect(rescoreMigration).toContain(
      "pg_get_functiondef('private.ingest_manual_input(jsonb)'::regprocedure)",
    );
    expect(rescoreMigration).toContain("RSS opportunity re-scoring semantics were not updated");
    expect(rescoreMigration).toContain("revoke all on function private.ingest_manual_input(jsonb)");
  });

  it("enforces the global automatic preparation score floor in Postgres", () => {
    expect(automaticScoreFloorMigration).toContain(
      "check (minimum_opportunity_score between 60 and 100)",
    );
    expect(automaticScoreFloorMigration).toContain(
      "brand_profiles_minimum_opportunity_score_check",
    );
    expect(automaticScoreFloorMigration).toContain("rss_feed_brand_links_minimum_score_check");
  });
});
