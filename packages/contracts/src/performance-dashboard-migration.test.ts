import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260726194237_brand_performance_dashboard.sql",
  ),
  "utf8",
);
const dailyHealthMigration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260730150423_align_daily_rss_feed_health.sql",
  ),
  "utf8",
);

describe("brand performance dashboard migration", () => {
  it("keeps reporting invoker-scoped with explicit Data API grants", () => {
    expect(migration).toContain("security invoker");
    expect(migration).not.toContain("security definer");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated");
    expect(migration).toContain("Brand access denied");
  });

  it("bounds the reporting window", () => {
    expect(migration).toContain("p_since >= p_until");
    expect(migration).toContain("p_until - p_since > interval '366 days'");
    expect(migration).toContain("Invalid performance dashboard window");
  });

  it("classifies current feed health without exposing feed errors", () => {
    expect(migration).toContain("when feed.consecutive_failures > 0 then 'failing'");
    expect(dailyHealthMigration).toContain("'interval ''30 minutes'''");
    expect(dailyHealthMigration).toContain("'interval ''26 hours'''");
    expect(dailyHealthMigration).toContain("Expected 30-minute feed-health boundary was not found");
    expect(dailyHealthMigration).toContain("from public, anon");
    expect(dailyHealthMigration).toContain("to authenticated");
    expect(dailyHealthMigration).not.toContain("security definer");
    expect(migration).toContain("'never_polled'");
    expect(migration).not.toContain("'lastError'");
  });

  it("reports review outcomes, rejection reasons, and an explained approval rate", () => {
    expect(migration).toContain("'approvedCount'");
    expect(migration).toContain("'rejectedCount'");
    expect(migration).toContain("'changesRequestedCount'");
    expect(migration).toContain("approved_count + rejected_count");
    expect(migration).toContain("'rejectionReasons'");
  });

  it("reports generation volume by style and successful workflow type", () => {
    expect(migration).toContain("'opportunityCount'");
    expect(migration).toContain("'draftCount'");
    expect(migration).toContain("'imageReadyCount'");
    expect(migration).toContain("'byStyle'");
    expect(migration).toContain("'successfulRunsByType'");
  });

  it("indexes brand and reporting-window predicates", () => {
    expect(migration).toContain("feedback_events_brand_created_idx");
    expect(migration).toContain("post_drafts_brand_created_idx");
    expect(migration).toContain("(brand_id, created_at desc)");
  });
});
