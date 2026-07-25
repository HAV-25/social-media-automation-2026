import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260724205940_api_security_controls.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const secretKeyCompatibilityMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260725150325_support_secret_api_keys_for_rate_limits.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const databaseTest = readFileSync(
  fileURLToPath(
    new URL("../../../supabase/tests/database/api_security_controls.test.sql", import.meta.url),
  ),
  "utf8",
);
const workflowAuth = readFileSync(
  fileURLToPath(new URL("../../../apps/web/lib/workflow-auth.ts", import.meta.url)),
  "utf8",
);
const apiRateLimit = readFileSync(
  fileURLToPath(new URL("../../../apps/web/lib/api-rate-limit.ts", import.meta.url)),
  "utf8",
);
const supabaseServiceClient = readFileSync(
  fileURLToPath(new URL("../../../apps/web/lib/supabase/service.ts", import.meta.url)),
  "utf8",
);
const userApiRoutes = [
  "inputs/route.ts",
  "inputs/one-off/route.ts",
  "inputs/upload/route.ts",
  "rss-feeds/route.ts",
  "opportunities/[opportunityId]/generate/route.ts",
  "opportunities/[opportunityId]/research/route.ts",
  "posts/[postDraftId]/regenerate/route.ts",
  "posts/[postDraftId]/images/route.ts",
  "posts/[postDraftId]/image/route.ts",
  "posts/[postDraftId]/download/route.ts",
].map((route) =>
  readFileSync(
    fileURLToPath(new URL(`../../../apps/web/app/api/${route}`, import.meta.url)),
    "utf8",
  ),
);
const rotatingWorkflowFiles = [
  "wf-02-manual-intake.json",
  "wf-03-normalize.json",
  "wf-04-cluster-score.json",
  "wf-05-research.json",
  "wf-06-angle-post-generation.json",
  "wf-07-post-verification.json",
  "wf-08-image-generation.json",
  "wf-09-content-actions.json",
].map((filename) =>
  readFileSync(
    fileURLToPath(new URL(`../../../n8n/workflows/${filename}`, import.meta.url)),
    "utf8",
  ),
);

describe("Feature 8.3 API security controls", () => {
  it("stores only hashed subjects in an RLS-protected private counter", () => {
    expect(migration).toContain("create table private.api_rate_limit_counters");
    expect(migration).toContain("subject_hash text not null");
    expect(migration).toContain(
      "alter table private.api_rate_limit_counters enable row level security",
    );
    expect(migration).toContain(
      "revoke all on private.api_rate_limit_counters from public, anon, authenticated",
    );
    expect(migration).not.toMatch(/user_id|workflow_name|ip_address/);
  });

  it("atomically caps a fixed window and exposes the function only to service role", () => {
    expect(migration).toContain("on conflict (scope, subject_hash, operation, window_started_at)");
    expect(migration).toContain(
      "where private.api_rate_limit_counters.request_count < requested_limit",
    );
    expect(migration).toContain("'allowed', request_allowed");
    expect(migration).toContain(
      "coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'",
    );
    expect(migration).toContain(
      "grant execute on function public.consume_api_rate_limit(text, text, text, integer, integer)",
    );
  });

  it("supports opaque Supabase secret keys without weakening the service-role boundary", () => {
    expect(secretKeyCompatibilityMigration).toContain("if current_user <> 'service_role'");
    expect(secretKeyCompatibilityMigration).not.toContain("current_setting(");
    expect(secretKeyCompatibilityMigration).toContain(
      "revoke all on function private.consume_api_rate_limit(text, text, text, integer, integer)",
    );
    expect(secretKeyCompatibilityMigration).toContain(
      "grant execute on function private.consume_api_rate_limit(text, text, text, integer, integer)",
    );
  });

  it("enforces limits on every user API and through the shared workflow authenticator", () => {
    for (const route of userApiRoutes) {
      expect(route).toContain("enforceUserApiRateLimit");
    }
    expect(workflowAuth).toContain("enforceInternalApiRateLimit");
    expect(workflowAuth).toContain("WORKFLOW_HMAC_PREVIOUS_SECRET");
  });

  it("keeps opaque secret-key requests server-classified and dependency logs redacted", () => {
    expect(supabaseServiceClient).toContain('"User-Agent": "appsbrite-social-server/1.0"');
    expect(apiRateLimit).toContain("sanitizeLogMetadata");
    expect(apiRateLimit).toContain("z.iso.datetime({ offset: true })");
    expect(apiRateLimit).not.toContain("console.error(error)");
  });

  it("accepts active and previous HMAC secrets in every receiving n8n workflow", () => {
    for (const workflow of rotatingWorkflowFiles) {
      expect(workflow).toContain("$env.WORKFLOW_HMAC_PREVIOUS_SECRET");
      expect(workflow).toContain("[secret, previousSecret].filter(Boolean).some");
      expect(workflow).toContain("createHmac('sha256', secret)");
    }
  });

  it("commits transactional database verification", () => {
    expect(databaseTest).toContain("select plan(8)");
    expect(databaseTest).toContain("third request in the same fixed window is denied");
    expect(databaseTest).toContain("authenticated callers cannot consume internal limits");
    expect(databaseTest).toContain("rollback;");
  });
});
