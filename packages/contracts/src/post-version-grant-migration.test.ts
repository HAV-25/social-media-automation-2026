import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260726102244_grant_post_versions_select.sql",
    import.meta.url,
  ),
);
const sql = readFileSync(migrationPath, "utf8");

describe("post-version reviewer grant hotfix", () => {
  it("adds only the missing authenticated SELECT grant", () => {
    expect(sql).toContain("grant select on public.post_versions to authenticated");
    expect(sql).not.toMatch(/\bto anon\b/i);
    expect(sql).not.toMatch(/\bgrant (insert|update|delete)\b/i);
    expect(sql).not.toMatch(/security definer/i);
  });
});
