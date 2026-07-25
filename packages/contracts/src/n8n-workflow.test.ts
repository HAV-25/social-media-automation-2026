import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const workflowSchema = z.object({
  active: z.literal(false),
  connections: z.record(z.string(), z.unknown()),
  name: z.string().regex(/^WF-(?:0[1-9]|10) /),
  nodes: z.array(
    z.object({
      credentials: z.never().optional(),
      id: z.uuid(),
      name: z.string().min(1),
      parameters: z.record(z.string(), z.unknown()),
      type: z.string().min(1),
      typeVersion: z.number().positive(),
    }),
  ),
  settings: z.object({
    executionOrder: z.literal("v1"),
    executionTimeout: z.number().positive(),
  }),
});

const workflowPath = fileURLToPath(
  new URL("../../../n8n/workflows/wf-01-rss-intake.json", import.meta.url),
);
const workflowDirectory = fileURLToPath(new URL("../../../n8n/workflows/", import.meta.url));
const appDirectory = fileURLToPath(new URL("../../../apps/web/app/", import.meta.url));
const publisherPath = fileURLToPath(
  new URL("../../../scripts/publish-n8n-workflows.mjs", import.meta.url),
);

describe("WF-01 RSS Intake workflow", () => {
  it("is valid JSON, inactive, credential-free, and structurally importable", () => {
    const source = readFileSync(workflowPath, "utf8");
    const workflow = workflowSchema.parse(JSON.parse(source));

    expect(workflow.nodes.map((node) => node.name)).toEqual([
      "Every 15 Minutes",
      "Signed One-off RSS Webhook",
      "Verify One-off RSS Request",
      "Sign Feed Plan Request",
      "Fetch Active Feed Plan",
      "Split Feeds",
      "Sign Safe Fetch Request",
      "Fetch and Parse Feed Safely",
      "Split Feed Items",
      "Sign Item Intake Request",
      "Persist RSS Intake",
      "Sign Analysis Request",
      "Normalize Cluster Score and Gate",
    ]);
    expect(source).not.toMatch(/service[_-]?role|credentialId|OPENAI_API_KEY/i);
  });

  it("uses signed application endpoints and stable item idempotency", () => {
    const source = readFileSync(workflowPath, "utf8");

    expect(source).toContain("/api/internal/workflows/rss/fetch");
    expect(source).toContain("/api/internal/workflows/rss/intake");
    expect(source).toContain("/api/internal/workflows/rss/analyze");
    expect(source).toContain("/webhook/rss-intake-run-v1");
    expect(source).toContain("brandQuery");
    expect(source).toContain("timingSafeEqual");
    expect(source).toContain("createHmac('sha256'");
    expect(source).toContain("rss-item:");
  });

  it("exposes a brand-scoped, signed, durable one-off trigger", () => {
    const route = readFileSync(`${appDirectory}api/rss-intake/run/route.ts`, "utf8");
    const workflow = readFileSync(`${workflowDirectory}wf-01-rss-intake.json`, "utf8");
    const feedPlan = readFileSync(
      `${appDirectory}api/internal/workflows/rss/feeds/route.ts`,
      "utf8",
    );

    expect(route).toContain("enforceUserApiRateLimit");
    expect(route).toContain("getBrandConfiguration");
    expect(route).toContain("signWorkflowRequest");
    expect(route).toContain('run_type: "rss_intake_dispatch"');
    expect(route).toContain('"rss.intake.manual_dispatch"');
    expect(feedPlan).toContain("rss_feed_brand_links!inner");
    expect(feedPlan).toContain("rss_feed_brand_links.brand_id");
    const fetchRoute = readFileSync(
      `${appDirectory}api/internal/workflows/rss/fetch/route.ts`,
      "utf8",
    );
    expect(fetchRoute).toContain("RSS_ITEMS_PER_FEED_PER_RUN");
    expect(fetchRoute).toContain(".slice(0, itemLimit)");
    expect(fetchRoute).toContain("item.summary?.slice(0, 4_000)");
    expect(workflow).toContain('"name": "accept-encoding"');
    expect(workflow).toContain('"value": "identity"');
    expect(route).not.toMatch(/N8N_API_KEY|service[_-]?role/i);
  });
});

describe("Milestone 4 n8n workflow package", () => {
  it.each([
    ["wf-02-manual-intake.json", "WF-02 Manual Intake"],
    ["wf-03-normalize.json", "WF-03 Normalize"],
    ["wf-04-cluster-score.json", "WF-04 Cluster and Score"],
  ])("%s is inactive, credential-free, and structurally importable", (filename, name) => {
    const source = readFileSync(`${workflowDirectory}${filename}`, "utf8");
    const workflow = workflowSchema.parse(JSON.parse(source));

    expect(workflow.name).toBe(name);
    expect(workflow.nodes.some((node) => node.type === "n8n-nodes-base.webhook")).toBe(true);
    expect(workflow.nodes.some((node) => node.type === "n8n-nodes-base.code")).toBe(true);
    expect(workflow.nodes.some((node) => node.type === "n8n-nodes-base.httpRequest")).toBe(true);
    expect(source).toContain("createHmac('sha256'");
    expect(source).toContain("timingSafeEqual");
    expect(source).not.toMatch(/service[_-]?role|credentialId|OPENAI_API_KEY/i);
  });

  it("chains intake to normalization and normalization to the durable score gate", () => {
    const manual = readFileSync(`${workflowDirectory}wf-02-manual-intake.json`, "utf8");
    const normalize = readFileSync(`${workflowDirectory}wf-03-normalize.json`, "utf8");
    const score = readFileSync(`${workflowDirectory}wf-04-cluster-score.json`, "utf8");
    const rssAnalyze = readFileSync(
      `${appDirectory}api/internal/workflows/rss/analyze/route.ts`,
      "utf8",
    );

    expect(manual).toContain("/webhook/source-normalize-v1");
    expect(normalize).toContain("/webhook/cluster-score-v1");
    expect(score).toContain("/api/internal/workflows/rss/analyze");
    expect(rssAnalyze).toContain("created_by: z.uuid().nullable()");
    expect(rssAnalyze).toContain('.from("organization_members")');
    expect(rssAnalyze).toContain("submittedBy: actorId");
    expect(rssAnalyze).toContain("originalUrl: source.canonical_url");
    expect(rssAnalyze).toContain("new Date(source.published_at).toISOString()");
    expect(rssAnalyze).toContain("internalFailureSchema.safeParse");
    expect(rssAnalyze).toContain("persisted.status");
  });
});

describe("Milestone 5 research workflow", () => {
  it("is inactive, credential-free, signed, and delegates intelligence to the typed app API", () => {
    const source = readFileSync(`${workflowDirectory}wf-05-research.json`, "utf8");
    const workflow = workflowSchema.parse(JSON.parse(source));

    expect(workflow.name).toBe("WF-05 Research");
    expect(source).toContain("/api/internal/workflows/recovery/execute");
    expect(source).toContain("target: 'research'");
    expect(source).toContain("createHmac('sha256'");
    expect(source).toContain("timingSafeEqual");
    expect(source).not.toMatch(/service[_-]?role|credentialId|OPENAI_API_KEY|system prompt/i);
  });
});

describe("Milestone 6 editorial workflows", () => {
  it.each([
    [
      "wf-06-angle-post-generation.json",
      "WF-06 Angle and Post Generation",
      "target: 'editorial_generation'",
    ],
    ["wf-07-post-verification.json", "WF-07 Post Verification", "target: 'post_verification'"],
    ["wf-09-content-actions.json", "WF-09 Content Actions", "target: isImageAction"],
  ])("%s is signed, inactive, credential-free, and importable", (filename, name, endpoint) => {
    const source = readFileSync(`${workflowDirectory}${filename}`, "utf8");
    const workflow = workflowSchema.parse(JSON.parse(source));

    expect(workflow.name).toBe(name);
    expect(source).toContain(endpoint);
    expect(source).toContain("createHmac('sha256'");
    expect(source).toContain("timingSafeEqual");
    expect(source).not.toMatch(
      /service[_-]?role|credentialId|OPENAI_API_KEY|system prompt|developer message/i,
    );
  });

  it.each(["generate", "verify", "actions"])(
    "has a concrete signed application endpoint for %s",
    (action) => {
      const route = readFileSync(
        `${appDirectory}api/internal/workflows/posts/${action}/route.ts`,
        "utf8",
      );
      expect(route).toContain("authenticateWorkflowRequest");
      expect(route).toContain("Cache-Control");
      expect(route).not.toMatch(/TODO|not implemented/i);
    },
  );

  it("routes selective image actions through the signed image API", () => {
    const source = readFileSync(`${workflowDirectory}wf-09-content-actions.json`, "utf8");

    expect(source).toContain("regenerate_concept");
    expect(source).toContain("regenerate_base");
    expect(source).toContain("change_template");
    expect(source).toContain("'image_generation'");
  });
});

describe("Milestone 7 image workflow", () => {
  it("is signed, inactive, credential-free, and delegates WF-08 to the typed application API", () => {
    const source = readFileSync(`${workflowDirectory}wf-08-image-generation.json`, "utf8");
    const workflow = workflowSchema.parse(JSON.parse(source));

    expect(workflow.name).toBe("WF-08 Image Generation");
    expect(source).toContain("/api/internal/workflows/recovery/execute");
    expect(source).toContain("target: 'image_generation'");
    expect(source).toContain("expectedVersionId");
    expect(source).toContain("createHmac('sha256'");
    expect(source).toContain("timingSafeEqual");
    expect(source).not.toMatch(
      /service[_-]?role|credentialId|OPENAI_API_KEY|system prompt|developer message/i,
    );
  });

  it("has a concrete signed image endpoint and records n8n failures without embedded credentials", () => {
    const route = readFileSync(
      `${appDirectory}api/internal/workflows/images/generate/route.ts`,
      "utf8",
    );
    const source = readFileSync(`${workflowDirectory}wf-08-image-generation.json`, "utf8");

    expect(route).toContain("authenticateWorkflowRequest");
    expect(route).toContain("imageWorkflowRequestSchema");
    expect(route).toContain("Cache-Control");
    expect(source).toContain('"saveDataErrorExecution": "all"');
    expect(route).not.toMatch(/TODO|not implemented/i);
  });

  it("publishes by stable name with a dry-run default and duplicate protection", () => {
    const publisher = readFileSync(publisherPath, "utf8");

    expect(publisher).toContain("Dry run only; no n8n changes made.");
    expect(publisher).toContain("Refusing to update duplicate remote workflows");
    expect(publisher).toContain('"X-N8N-API-KEY": apiKey');
    expect(publisher).toContain("N8N_PROJECT_ID");
    expect(publisher).toContain("N8N_FOLDER_ID");
    expect(publisher).toContain("supportsFolderPlacementOnCreate");
    expect(publisher).toContain("verified UI folder placement before publication");
    expect(publisher).toContain("errorWorkflow: errorWorkflowId");
    expect(publisher).toContain("/workflows/${encodeURIComponent(workflowId)}/activate");
    expect(publisher).not.toContain("/publish");
    for (const workflowNumber of ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]) {
      expect(publisher).toContain(`wf-${workflowNumber}`);
    }
    expect(publisher).not.toMatch(/console\.(?:log|table)\([^)]*apiKey/);
  });
});

describe("Milestone 8 recovery workflow", () => {
  it("is importable, credential-free, and handles error intake plus durable polling", () => {
    const source = readFileSync(`${workflowDirectory}wf-10-error-recovery.json`, "utf8");
    const workflow = workflowSchema.parse(JSON.parse(source));

    expect(workflow.name).toBe("WF-10 Error and Recovery");
    expect(workflow.nodes.some((node) => node.type === "n8n-nodes-base.errorTrigger")).toBe(true);
    expect(workflow.nodes.some((node) => node.type === "n8n-nodes-base.scheduleTrigger")).toBe(
      true,
    );
    expect(source).toContain("/api/internal/workflows/recovery/failures");
    expect(source).toContain("/api/internal/workflows/recovery/dispatch");
    expect(source).toContain("category = 'security'");
    expect(source).not.toMatch(/credentials|credentialId|N8N_API_KEY|OPENAI_API_KEY/i);
  });

  it("wraps every model/image workflow in a replayable application contract", () => {
    for (const filename of [
      "wf-05-research.json",
      "wf-06-angle-post-generation.json",
      "wf-07-post-verification.json",
      "wf-08-image-generation.json",
      "wf-09-content-actions.json",
    ]) {
      const source = readFileSync(`${workflowDirectory}${filename}`, "utf8");
      expect(source).toContain("/api/internal/workflows/recovery/execute");
      expect(source).toContain("workflowExecutionId: String($execution.id)");
      expect(source).toContain("requestPayload:");
    }
  });
});

describe("n8n 2.21 runtime compatibility", () => {
  const filenames = [
    "wf-01-rss-intake.json",
    "wf-02-manual-intake.json",
    "wf-03-normalize.json",
    "wf-04-cluster-score.json",
    "wf-05-research.json",
    "wf-06-angle-post-generation.json",
    "wf-07-post-verification.json",
    "wf-08-image-generation.json",
    "wf-09-content-actions.json",
    "wf-10-error-recovery.json",
  ];
  const allowedEnvironment = new Set([
    "APP_BASE_URL",
    "N8N_WEBHOOK_BASE_URL",
    "WORKFLOW_HMAC_PREVIOUS_SECRET",
    "WORKFLOW_HMAC_SECRET",
  ]);

  it.each(filenames)("%s uses only the approved builtin and environment allowlists", (filename) => {
    const source = readFileSync(`${workflowDirectory}${filename}`, "utf8");
    const requiredModules = [
      ...new Set([...source.matchAll(/require\('([^']+)'\)/g)].map((match) => match[1]!)),
    ];
    const environmentNames = [
      ...new Set([...source.matchAll(/\$env\.([A-Z0-9_]+)/g)].map((match) => match[1]!)),
    ];

    expect(requiredModules).toEqual(["crypto"]);
    expect(environmentNames.every((name) => allowedEnvironment.has(name))).toBe(true);
    expect(source).not.toContain("process.env");
  });

  it.each(filenames)("%s bounds every application HTTP request", (filename) => {
    const workflow = workflowSchema.parse(
      JSON.parse(readFileSync(`${workflowDirectory}${filename}`, "utf8")),
    );
    const requests = workflow.nodes.filter((node) => node.type === "n8n-nodes-base.httpRequest");

    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      const options = z
        .object({ timeout: z.number().int().min(1_000).max(200_000) })
        .parse(request.parameters.options);
      const headers = z
        .object({
          parameters: z.array(z.object({ name: z.string(), value: z.string() })),
        })
        .parse(request.parameters.headerParameters);
      expect(options.timeout).toBeGreaterThanOrEqual(1_000);
      expect(
        headers.parameters.some(
          (header) =>
            header.name.toLowerCase() === "accept-encoding" && header.value === "identity",
        ),
      ).toBe(true);
    }
  });
});
