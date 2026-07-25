import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "../../supabase/migrations/20260725110551_brand_dashboard_metrics.sql"),
  "utf8",
);

describe("brand dashboard metrics migration", () => {
  it("requires brand read access and grants only authenticated execution", () => {
    expect(migration).toContain("if not public.can_read_brand(p_brand_id)");
    expect(migration).toContain(
      "revoke all on function public.get_brand_dashboard_metrics(uuid, timestamptz)",
    );
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated");
  });

  it("computes exact brand-scoped source and opportunity counts", () => {
    expect(migration).toContain("brand_link.brand_id = p_brand_id");
    expect(migration).toContain("source.created_at >= p_since");
    expect(migration).toContain("opportunity.brand_id = p_brand_id");
    expect(migration).toContain("'ready_to_generate'");
  });

  it("derives research spend from recorded run provenance", () => {
    expect(migration).toContain("run.run_type = 'research'");
    expect(migration).toContain("run.model_usage ->> 'costUsd'");
    expect(migration).toContain("run.model_usage ->> 'estimatedCostUsd'");
    expect(migration).toContain("run.model_usage ->> 'reservedCostUsd'");
  });
});
