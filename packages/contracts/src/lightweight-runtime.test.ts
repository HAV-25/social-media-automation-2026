import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const controlPlane = readFileSync(
  new URL(
    "../../../supabase/migrations/20260811122309_lightweight_pipeline_control_plane.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const persistence = readFileSync(
  new URL(
    "../../../supabase/migrations/20260811163500_lightweight_stage_persistence.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const worker = readFileSync(
  new URL("../../../supabase/functions/lightweight-stage-worker/index.ts", import.meta.url),
  "utf8",
);
const supabaseConfig = readFileSync(
  new URL("../../../supabase/config.toml", import.meta.url),
  "utf8",
);

describe("lightweight production runtime", () => {
  it("claims durable jobs atomically and bounds retries", () => {
    expect(controlPlane).toContain("for update skip locked");
    expect(controlPlane).toContain("attempt < job.max_attempts");
    expect(controlPlane).toContain("least(3600, 30 * power(2");
    expect(controlPlane).toContain("idempotency key reused with different payload");
  });

  it("keeps privileged payloads private and opaque-key authorization invoker based", () => {
    expect(controlPlane).toContain("create table private.pipeline_job_payloads");
    expect(controlPlane).toContain("if current_user <> 'service_role'");
    expect(controlPlane).toContain(
      "revoke all on private.pipeline_job_payloads from public, anon, authenticated",
    );
    expect(persistence).toContain("security definer");
    expect(persistence).toContain("set search_path = ''");
    expect(persistence).toContain(
      "revoke all on function private.persist_lightweight_stage_output",
    );
  });

  it("persists all reviewer outputs and never introduces publishing", () => {
    for (const table of [
      "research_runs",
      "post_drafts",
      "post_versions",
      "image_assets",
      "content_packages",
    ]) {
      expect(persistence).toContain(`public.${table}`);
    }
    expect(`${controlPlane}\n${persistence}`).not.toMatch(/auto[_ -]?publish|schedule[_ -]?post/);
  });

  it("keeps prompts versioned in TypeScript and validates generated output", () => {
    expect(worker).toContain("LIGHTWEIGHT_RESEARCH_PROMPT_VERSION");
    expect(worker).toContain("researchResultSchema.parse");
    expect(worker).toContain("draftResultSchema.parse");
    expect(worker).toContain("blocking: false");
  });

  it("ships five small n8n schedulers with no application-runtime dependency", () => {
    const directory = `${root}\\n8n\\lightweight`;
    const files = readdirSync(directory).filter((file) => file.endsWith(".json"));
    expect(files).toHaveLength(5);
    for (const file of files) {
      const workflow = readFileSync(`${directory}\\${file}`, "utf8");
      expect(() => JSON.parse(workflow)).not.toThrow();
      expect(workflow).toContain("SUPABASE_URL");
      expect(workflow).toContain("LIGHTWEIGHT_WORKER_SECRET");
      expect(workflow).not.toContain("SUPABASE_SECRET_KEY");
      expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(workflow).not.toContain("APP_BASE_URL");
      expect(workflow).not.toContain("netlify");
    }
  });

  it("protects opaque-key Edge endpoints with the dedicated worker secret", () => {
    expect(supabaseConfig).toMatch(
      /\[functions\.lightweight-daily-intake\][\s\S]*?verify_jwt = false/,
    );
    expect(supabaseConfig).toMatch(
      /\[functions\.lightweight-stage-worker\][\s\S]*?verify_jwt = false/,
    );
    expect(worker).toContain("requireWorkerSecret(request)");
  });
});
