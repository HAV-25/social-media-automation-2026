import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "../../supabase/migrations/20260726183137_ai_cost_observability.sql"),
  "utf8",
);
const indexMigration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260726184131_index_ai_cost_observability.sql",
  ),
  "utf8",
);

describe("AI cost observability migration", () => {
  it("keeps the reporting RPC invoker-scoped and brand-authorized", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("if not public.can_read_brand(p_brand_id)");
    expect(migration).toContain(
      "revoke all on function public.get_brand_ai_cost_observability(uuid, timestamptz)",
    );
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated");
    expect(migration).not.toContain("security definer");
  });

  it("normalizes each supported cost and usage shape without reading provider payloads", () => {
    expect(migration).toContain("run.model_usage -> 'costUsd'");
    expect(migration).toContain("run.model_usage -> 'estimatedCostUsd'");
    expect(migration).toContain("run.model_usage #> '{usage,estimatedCostUsd}'");
    expect(migration).toContain("run.model_usage -> 'reservedCostUsd'");
    expect(migration).toContain("run.model_usage #> '{usage,inputTokens}'");
    expect(migration).toContain("run.model_usage -> 'webSearchCalls'");
  });

  it("reports by stage, model, source type, and content package", () => {
    expect(migration).toContain("'byStage'");
    expect(migration).toContain("'byModel'");
    expect(migration).toContain("'bySourceType'");
    expect(migration).toContain("'byPackage'");
    expect(migration).toContain("draft.status = 'approved'");
  });

  it("backfills historical research model provenance from the durable research ledger", () => {
    expect(migration).toContain("from public.research_runs as research");
    expect(migration).toContain("'model', research.model");
    expect(migration).toContain("'promptVersion', research.prompt_version");
    expect(migration).toContain("'responseId', research.provider_response_id");
  });

  it("indexes the exact brand and time-window predicates used by the ledger", () => {
    expect(indexMigration).toContain("generation_runs_brand_created_idx");
    expect(indexMigration).toContain("(brand_id, created_at desc)");
    expect(indexMigration).toContain("where brand_id is not null");
  });
});
