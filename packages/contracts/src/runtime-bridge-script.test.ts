import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  resolve(process.cwd(), "../../scripts/check-runtime-bridge.mjs"),
  "utf8",
);
const packageManifest = JSON.parse(
  readFileSync(resolve(process.cwd(), "../../package.json"), "utf8"),
) as { scripts: Record<string, string> };

describe("runtime bridge preflight", () => {
  it("checks both local secret stores without logging values", () => {
    expect(script).toContain('envFile(".env.local")');
    expect(script).toContain('envFile(".env.n8n.local")');
    expect(script).toContain('"WORKFLOW_HMAC_SECRET"');
    expect(script).toContain('"SUPABASE_SECRET_KEY"');
    expect(script).not.toMatch(/console\.(?:log|error)\([^)]*app\./);
    expect(script).not.toMatch(/console\.(?:log|error)\([^)]*publisher\./);
  });

  it("checks exact workflow names and reports inactive state without changing it", () => {
    expect(script).toContain("WF-01 RSS Intake");
    expect(script).toContain("WF-10 Error and Recovery");
    expect(script).toContain("inactiveNames");
    expect(script).toContain("n8n inactive workflow:");
    expect(script).not.toMatch(/\/activate|method:\s*["'](?:POST|PUT|DELETE)/);
  });

  it("lists every n8n container setting required by the Code nodes", () => {
    expect(script).toContain('"NODE_FUNCTION_ALLOW_BUILTIN"');
    expect(script).toContain('"N8N_BLOCK_ENV_ACCESS_IN_NODE"');
  });

  it("is exposed as a read-only package command", () => {
    expect(packageManifest.scripts["runtime:preflight"]).toBe(
      "node scripts/check-runtime-bridge.mjs --remote",
    );
  });
});
