import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
const providerRuntime = readFileSync(
  new URL("../../../supabase/functions/_shared/openai-runtime.ts", import.meta.url),
  "utf8",
);
const imageRuntime = readFileSync(
  new URL("../../../supabase/functions/_shared/image-runtime.ts", import.meta.url),
  "utf8",
);
const reviewer = readFileSync(
  new URL("../../../apps/reviewer/src/main.tsx", import.meta.url),
  "utf8",
);
const reviewerData = readFileSync(
  new URL("../../../apps/reviewer/src/data.ts", import.meta.url),
  "utf8",
);
const supabaseConfig = readFileSync(
  new URL("../../../supabase/config.toml", import.meta.url),
  "utf8",
);
const n8nPublisherSource = readFileSync(
  new URL("../../../scripts/publish-n8n-workflows.mjs", import.meta.url),
  "utf8",
);
const rootPackage = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as { scripts?: Record<string, string> };

describe("lightweight production runtime", () => {
  it("has a dedicated inactive-only n8n import profile", () => {
    expect(rootPackage.scripts?.["n8n:lightweight:plan"]).toContain("--profile=lightweight");
    expect(rootPackage.scripts?.["n8n:lightweight:import"]).toContain(
      "--profile=lightweight --apply",
    );
    expect(rootPackage.scripts?.["n8n:lightweight:import"]).not.toContain("--publish");
    expect(n8nPublisherSource).toContain("Lightweight workflows must be imported inactive.");
    expect(n8nPublisherSource).toContain('profile === "lightweight" && publish');
    expect(n8nPublisherSource).toContain('linkRecoveryWorkflow: profile === "legacy"');
  });

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
    expect(worker).toContain("draftSetResultSchema.parse");
    expect(worker).toContain("blocking: false");
    expect(worker).toContain("evaluateDraft({");
    expect(worker).not.toContain("evidenceScore: 80");
    expect(worker).not.toContain("brandFitScore: 75");
    expect(providerRuntime).toContain("citations: citations(body)");
    expect(worker).toContain("research_source_not_observed");
  });

  it("composes and validates the final branded image instead of adding a border only", () => {
    expect(imageRuntime).toContain("new Resvg");
    expect(imageRuntime).toContain("Inter-Bold.ttf");
    expect(imageRuntime).toContain("headlineFits");
    expect(imageRuntime).toContain("hasSufficientContrast");
    expect(worker).toContain("final_image_validation_failed");
  });

  it("retains the approved reviewer evidence, audit and durable download surfaces", () => {
    expect(reviewer).toContain("Claims ledger");
    expect(reviewer).toContain("Activity & audit");
    expect(reviewer).toContain("Download durable package");
    expect(reviewer).toContain("Exact image-generation prompt");
    expect(reviewer).toContain("Inspect normalized source");
    expect(reviewer).toContain("Explainable score");
    expect(reviewer).toContain("Research caveats");
    expect(reviewer).toContain("Material conflicts");
    expect(reviewer).toContain("downloadBlob");
    expect(reviewerData).toContain('.eq("status", "ready_for_review")');
    expect(reviewerData).toContain("image.post_version_id === currentVersionByDraft");
    expect(reviewerData).toContain("manifestContainsDraftVersion");
    expect(reviewerData).toContain("expectedVersionId");
    expect(reviewerData).toContain("idempotencyKey");
  });

  it("ships five small n8n schedulers with no application-runtime dependency", () => {
    const directory = join(root, "n8n", "lightweight");
    const files = readdirSync(directory).filter((file) => file.endsWith(".json"));
    expect(files).toHaveLength(5);
    for (const file of files) {
      const workflow = readFileSync(join(directory, file), "utf8");
      expect(() => JSON.parse(workflow)).not.toThrow();
      expect(workflow).toContain("SUPABASE_URL");
      expect(workflow).toContain("LIGHTWEIGHT_WORKER_SECRET");
      expect(workflow).not.toContain("SUPABASE_SECRET_KEY");
      expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(workflow).not.toContain("APP_BASE_URL");
      expect(workflow).not.toContain("netlify");
    }
  });

  it("keeps daily intake capacity separate from post limits and fits retries inside timeout", () => {
    const workflow = JSON.parse(
      readFileSync(join(root, "n8n", "lightweight", "lw-01-daily-intake.json"), "utf8"),
    ) as {
      nodes: Array<{
        name: string;
        parameters: { body?: string; options?: { timeout?: number } };
        retryOnFail?: boolean;
        maxTries?: number;
        waitBetweenTries?: number;
      }>;
      settings: { executionTimeout: number; timezone: string };
    };
    const request = workflow.nodes.find((node) => node.name === "Run Safe Daily Intake");
    expect(request?.parameters.body).toContain("maxItemsPerFeed: 50");
    expect(request?.retryOnFail).toBe(true);
    expect(request?.maxTries).toBe(3);
    const attempts = request?.maxTries ?? 1;
    const requestSeconds = (request?.parameters.options?.timeout ?? 0) / 1000;
    const waitSeconds = (request?.waitBetweenTries ?? 0) / 1000;
    expect(workflow.settings.executionTimeout).toBeGreaterThanOrEqual(
      attempts * requestSeconds + (attempts - 1) * waitSeconds,
    );
    expect(workflow.settings.timezone).toBe("Europe/Berlin");
  });

  it("does not add synchronous n8n retries around paid durable workers", () => {
    const directory = join(root, "n8n", "lightweight");
    for (const file of [
      "lw-02-research-worker.json",
      "lw-03-draft-verification-worker.json",
      "lw-04-image-package-worker.json",
      "lw-05-retry-recovery.json",
    ]) {
      const workflow = JSON.parse(readFileSync(join(directory, file), "utf8")) as {
        nodes: Array<{ type: string; retryOnFail?: boolean }>;
      };
      const requests = workflow.nodes.filter((node) => node.type === "n8n-nodes-base.httpRequest");
      expect(requests).toHaveLength(1);
      expect(requests[0]?.retryOnFail).not.toBe(true);
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
