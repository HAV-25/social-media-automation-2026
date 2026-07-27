import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260727150751_capture_exact_post_prompts.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("exact post prompt provenance migration", () => {
  it("stores constrained prompt snapshots on the RLS-protected post version", () => {
    expect(sql).toContain("add column if not exists prompt_snapshot jsonb");
    expect(sql).toContain("post_versions_prompt_snapshot_shape");
    expect(sql).toContain("capture_post_prompt_snapshot");
    expect(sql).toContain("new.model_usage -> 'promptSnapshot'");
    expect(sql).toContain("protect_post_prompt_snapshot");
    expect(sql).toContain("Post prompt snapshot is immutable");
  });

  it("keeps the trigger helper private and non-executable over the Data API", () => {
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain(
      "revoke all on function private.capture_post_prompt_snapshot() from public",
    );
    expect(sql).toContain(
      "revoke all on function private.capture_post_prompt_snapshot() from authenticated",
    );
  });
});
