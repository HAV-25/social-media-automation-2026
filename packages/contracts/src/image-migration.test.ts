import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260724154050_image_asset_persistence_and_storage.sql",
    import.meta.url,
  ),
);
const sql = readFileSync(migrationPath, "utf8");
const databaseTestPath = fileURLToPath(
  new URL("../../../supabase/tests/database/image_assets.test.sql", import.meta.url),
);
const databaseTestSql = readFileSync(databaseTestPath, "utf8");

describe("image asset persistence migration", () => {
  it("enforces tenant paths, validation state, immutable provenance, and terminal states", () => {
    expect(sql).toContain("create type public.image_asset_status");
    expect(sql).toContain("private.assert_image_asset_tenancy");
    expect(sql).toContain("Image generation provenance is immutable");
    expect(sql).toContain("Terminal image assets cannot change state");
    expect(sql).toContain("image_assets_ready_check");
    expect(sql).toContain("(dimensions ->> 'width')::integer = 1200");
    expect(sql).toContain("human_override_by is not null");
    expect(sql).toContain("'/base.png'");
    expect(sql).toContain("'/final.png'");
  });

  it("makes the generated image bucket read-only to browser roles", () => {
    expect(sql).toContain(
      "revoke insert, update, delete on public.image_assets from authenticated",
    );
    expect(sql).toContain("bucket_id in ('source-originals', 'brand-assets')");
    const writePolicies = [
      ...sql.matchAll(/create policy storage_source_brand_(?:insert|update|delete)[\s\S]*?\n\);/g),
    ];
    expect(writePolicies).toHaveLength(3);
    expect(writePolicies.every((policy) => !policy[0].includes("generated-images"))).toBe(true);
    expect(sql).toContain("bucket_id in ('source-originals', 'brand-assets', 'generated-images')");
  });

  it("keeps persistence and reviewer overrides service-only and idempotent", () => {
    expect(sql).toContain("create or replace function private.persist_image_asset");
    expect(sql).toContain("scope = 'image_generation'");
    expect(sql).toContain("create or replace function private.override_image_validation");
    expect(sql).toContain("scope = 'image_validation_override'");
    expect(sql).toContain(
      "grant execute on function public.persist_image_asset(jsonb) to service_role",
    );
    expect(sql).not.toContain(
      "grant execute on function public.persist_image_asset(jsonb) to authenticated",
    );
    expect(sql).toContain("Image reviewer permission required");
    expect(sql).toContain("current_post_version_id is distinct from target_version_id");
  });

  it("verifies Storage objects and records run, pipeline, audit, and feedback provenance", () => {
    expect(sql).toContain("from storage.objects");
    expect(sql).toContain("'app-image-generation'");
    expect(sql).toContain("'image.validation_required'");
    expect(sql).toContain("'image.validation_overridden'");
    expect(sql).toContain("insert into public.feedback_events");
    expect(sql).toContain("insert into public.audit_logs");
  });

  it("commits a transactional PostgreSQL fixture for permission and atomicity checks", () => {
    expect(databaseTestSql).toContain("select plan(21)");
    expect(databaseTestSql).toContain("authenticated editors cannot upload generated images");
    expect(databaseTestSql).toContain("an unassigned user cannot read the image asset");
    expect(databaseTestSql).toContain("assigned reviewer can explicitly override a flagged image");
    expect(databaseTestSql).toContain("rollback;");
  });
});
