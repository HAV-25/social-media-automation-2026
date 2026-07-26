import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260726160407_add_rss_item_review_state.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const indexMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260726161424_index_rss_item_review_state_foreign_keys.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("RSS archive and resurfacing migration", () => {
  it("stores one idempotent review state per brand and RSS item", () => {
    expect(migration).toContain("create table public.rss_item_review_states");
    expect(migration).toContain("primary key (brand_id, rss_feed_item_id)");
    expect(migration).toContain("rss_item_review_states (brand_id, resurfaced_at desc)");
    expect(indexMigration).toContain("rss_item_review_states (organization_id)");
    expect(indexMigration).toContain("rss_item_review_states (rss_feed_item_id)");
    expect(indexMigration).toContain("rss_item_review_states (resurfaced_by)");
  });

  it("enables RLS, verifies brand routing, and grants only required operations", () => {
    expect(migration).toContain(
      "alter table public.rss_item_review_states enable row level security",
    );
    expect(migration).toContain("to authenticated");
    expect(migration).toContain("resurfaced_by = (select auth.uid())");
    expect(migration).toContain("join public.rss_feed_brand_links route");
    expect(migration).toContain(
      "grant select, insert, update on public.rss_item_review_states to authenticated",
    );
    expect(migration).not.toContain(
      "grant delete on public.rss_item_review_states to authenticated",
    );
  });
});
