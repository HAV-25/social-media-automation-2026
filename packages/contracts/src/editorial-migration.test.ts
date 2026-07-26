import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260723213000_editorial_quality_and_regeneration.sql",
    import.meta.url,
  ),
);
const sql = readFileSync(migrationPath, "utf8");
const initialSql = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260723125216_initial_tenancy_and_content_schema.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const reviewFixSql = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260725212000_qualify_post_review_version_lookup.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("editorial quality and regeneration migration", () => {
  it("enforces readiness arithmetic and claim provenance in PostgreSQL", () => {
    expect(sql).toContain("private.assert_editorial_evaluation");
    expect(sql).toContain("'evidenceScore')::numeric < 70");
    expect(sql).toContain("'brandFitScore')::numeric < 65");
    expect(sql).toContain("'sourceSimilarity')::numeric >= 0.82");
    expect(sql).toContain("Editorial evaluation has invalid claim provenance");
    expect(sql).toContain("Post has not passed editorial readiness");
  });

  it("persists angles, sentence claims, and immutable selective versions", () => {
    expect(sql).toContain("insert into public.angles");
    expect(sql).toContain("insert into public.post_claims");
    expect(sql).toContain("generation_type = 'selective_regeneration'");
    expect(sql).toContain("post.selective_regeneration");
    expect(sql).toContain("app-selective-regeneration");
    expect(initialSql).toContain("where version.post_draft_id = target_draft_id");
    expect(reviewFixSql).toContain(
      "pg_get_functiondef('private.review_post(jsonb)'::regprocedure)",
    );
    expect(reviewFixSql).toContain("where version.post_draft_id = target_draft_id");
  });

  it("keeps evaluated mutations service-only and idempotent", () => {
    expect(sql).toContain("private.create_evaluated_draft");
    expect(sql).toContain("private.review_evaluated_post");
    expect(sql).toContain("private.regenerate_post_component");
    expect(sql).toContain(
      "grant execute on function public.create_evaluated_draft(jsonb) to service_role",
    );
    expect(sql).not.toContain(
      "grant execute on function public.regenerate_post_component(jsonb) to authenticated",
    );
    expect(sql).toContain("private.review_post(review_payload)");
  });
});
