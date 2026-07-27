import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260726200541_brand_archive_policy.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("brand archive policy migration", () => {
  it("adds bounded non-destructive visibility windows", () => {
    expect(migration).toContain("rss_inbox_window_hours smallint not null default 24");
    expect(migration).toContain("rss_resurface_window_hours smallint not null default 24");
    expect(migration).toContain("rss_inbox_window_hours between 6 and 168");
    expect(migration).toContain("Older records remain durably archived");
  });

  it("records policy changes atomically without exposing the trigger function", () => {
    expect(migration).toContain("after update of rss_inbox_window_hours");
    expect(migration).toContain("'brand.archive_policy_updated'");
    expect(migration).toContain("'archiveMode', 'non_destructive'");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(
      "revoke all on function public.audit_brand_archive_policy_change()",
    );
  });
});
