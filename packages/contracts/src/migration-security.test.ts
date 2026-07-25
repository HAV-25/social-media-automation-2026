import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260723125216_initial_tenancy_and_content_schema.sql",
    import.meta.url,
  ),
);
const sql = readFileSync(migrationPath, "utf8");

describe("initial Supabase migration security contract", () => {
  it("enables RLS for every table created in the exposed public schema", () => {
    const createdTables = [...sql.matchAll(/create table public\.([a-z_]+)/g)].map(
      (match) => match[1],
    );
    const rlsTables = new Set(
      [...sql.matchAll(/alter table public\.([a-z_]+) enable row level security/g)].map(
        (match) => match[1],
      ),
    );

    expect(createdTables.length).toBeGreaterThan(20);
    expect(createdTables.filter((table) => !rlsTables.has(table))).toEqual([]);
  });

  it("keeps every SECURITY DEFINER function out of exposed schemas", () => {
    const definitions = [
      ...sql.matchAll(/create or replace function ([a-z_]+\.[a-z_]+)[\s\S]*?\$\$;/g),
    ].filter((match) => /security definer/i.test(match[0]));

    expect(definitions.length).toBeGreaterThan(4);
    expect(definitions.map((match) => match[1]).every((name) => name?.startsWith("private."))).toBe(
      true,
    );
  });

  it("uses explicit grants, no deprecated role helper, and no application grant for anon", () => {
    expect(sql).toContain("revoke all on all tables in schema public from anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).not.toMatch(/grant\s+.+\s+to\s+anon/i);
    expect(sql).not.toContain("auth.role()");
  });

  it("models shared RSS feeds and replay-safe atomic intake", () => {
    expect(sql).toContain("create table public.rss_feed_brand_links");
    expect(sql).toContain("create table private.workflow_nonces");
    expect(sql).toContain("create or replace function private.ingest_rss_item");
    expect(sql).toContain("on conflict (organization_id, workflow_name, idempotency_key, attempt)");
  });

  it("uses organization and brand prefixes for every private storage object", () => {
    expect(sql).toContain("(storage.foldername(name))[1]");
    expect(sql).toContain("(storage.foldername(name))[2]");
    expect(sql).toContain("public.is_organization_member");
    expect(sql).toContain("public.can_read_brand");
  });

  it("enforces administrator-only brand lifecycle changes in the database", () => {
    expect(sql).toContain("create or replace function public.protect_brand_lifecycle");
    expect(sql).toContain("brands_protect_lifecycle");
    expect(sql).toContain("public.can_manage_organization(old.organization_id)");
  });

  it("keeps manual intake and post mutations atomic and service-only", () => {
    expect(sql).toContain("create or replace function private.ingest_manual_input");
    expect(sql).toContain("create or replace function private.create_mock_draft");
    expect(sql).toContain("create or replace function private.review_post");
    expect(sql).toContain("create or replace function private.record_source_failure");
    expect(sql).toContain(
      "grant execute on function public.ingest_manual_input(jsonb) to service_role",
    );
    expect(sql).not.toContain(
      "grant execute on function public.ingest_manual_input(jsonb) to authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.record_source_failure(jsonb) to service_role",
    );
    expect(sql).toContain("opportunities_brand_source_unique");
    expect(sql).toContain("post_drafts_opportunity_style_tone_unique");
    expect(sql).toContain("duplicate_of_source_id");
    expect(sql).toContain("unique (organization_id, cluster_key)");
    expect(sql).toContain("source.near_duplicate_clustered");
    expect(sql).toContain("source_was_staged");
    expect(sql).toContain("when (payload ->> 'sourceType') = 'rss' then 'rss_analysis'");
    expect(sql).toContain("create or replace function private.upsert_rss_feed");
    expect(sql).toContain("create or replace function private.reserve_rss_generation");
    expect(sql).toContain("create or replace function private.record_rss_poll");
    expect(sql).toContain(
      "grant execute on function public.reserve_rss_generation(jsonb) to service_role",
    );
    expect(sql).toContain(
      "grant execute on function public.record_rss_poll(jsonb) to service_role",
    );
    expect(sql).toContain("consecutive_failures = rss_feeds.consecutive_failures + 1");
  });
});
