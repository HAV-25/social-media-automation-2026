import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
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
const editorialWorkflowPath = fileURLToPath(
  new URL("../../../apps/web/lib/editorial-workflows.ts", import.meta.url),
);
const imageCompositorPath = fileURLToPath(
  new URL("../../image-compositor/src/index.ts", import.meta.url),
);
const publisherPath = fileURLToPath(
  new URL("../../../scripts/publish-n8n-workflows.mjs", import.meta.url),
);
const nodeRequire = createRequire(import.meta.url);

function loadWorkflow(filename: string) {
  return workflowSchema.parse(JSON.parse(readFileSync(`${workflowDirectory}${filename}`, "utf8")));
}

function codeNode(filename: string, name: string) {
  const node = loadWorkflow(filename).nodes.find((candidate) => candidate.name === name);
  if (!node || typeof node.parameters.jsCode !== "string") {
    throw new Error(`Code node "${name}" was not found in ${filename}.`);
  }
  return node.parameters.jsCode;
}

function runCodeNode(
  source: string,
  context: {
    input?: { all?: () => unknown[]; first?: () => unknown };
    lookup?: (name: string) => { first: () => unknown; all?: () => unknown[] };
    env?: Record<string, string>;
    json?: Record<string, unknown>;
  },
) {
  const execute = new Function("require", "$input", "$", "$env", "$json", source);
  return execute(
    nodeRequire,
    {
      all: context.input?.all ?? (() => []),
      first: context.input?.first ?? (() => ({ json: {} })),
    },
    context.lookup ?? (() => ({ first: () => ({ json: {} }), all: () => [] })),
    context.env ?? {},
    context.json ?? {},
  ) as Array<{ json: Record<string, unknown> }>;
}

describe("WF-01 RSS Intake workflow", () => {
  it("is valid JSON, inactive, credential-free, and structurally importable", () => {
    const source = readFileSync(workflowPath, "utf8");
    const workflow = workflowSchema.parse(JSON.parse(source));

    expect(workflow.nodes.map((node) => node.name)).toEqual([
      "Daily at 1 AM Berlin",
      "Signed One-off RSS Webhook",
      "Verify One-off RSS Request",
      "Sign Feed Plan Request",
      "Fetch Active Feed Plan",
      "Sign Deferred Opportunity Sweep",
      "Claim Deferred Opportunities",
      "Decode Deferred Opportunity Sweep",
      "Prepare Deferred Opportunities",
      "Dispatch Deferred Research?",
      "Research Deferred Draft Verify and Image",
      "Restore Feed Plan",
      "Split Feeds",
      "Sign Safe Fetch Request",
      "Fetch and Parse Feed Safely",
      "Decode RSS JSON",
      "Validate RSS Fetch Contract",
      "Split Feed Items",
      "Sign Item Intake Request",
      "Persist RSS Intake",
      "Decode RSS Intake JSON",
      "Validate RSS Intake Contract",
      "Sign Analysis Request",
      "Normalize Cluster Score and Gate",
      "Decode Opportunity Decisions",
      "Prepare Selected Opportunities",
      "Dispatch Selected Research?",
      "Research Draft Verify and Image",
    ]);
    expect(workflow.nodes.find((node) => node.name === "Fetch and Parse Feed Safely")?.type).toBe(
      "n8n-nodes-base.httpRequest",
    );
    expect(workflow.nodes.find((node) => node.name === "Decode RSS JSON")?.type).toBe(
      "n8n-nodes-base.extractFromFile",
    );
    expect(workflow.nodes.find((node) => node.name === "Validate RSS Fetch Contract")?.type).toBe(
      "n8n-nodes-base.code",
    );
    expect(source).not.toMatch(/service[_-]?role|credentialId|OPENAI_API_KEY/i);
  });

  it("uses signed application endpoints and stable item idempotency", () => {
    const source = readFileSync(workflowPath, "utf8");

    expect(source).toContain("/api/internal/workflows/rss/fetch");
    expect(source).toContain("/api/internal/workflows/rss/intake");
    expect(source).toContain("/api/internal/workflows/rss/analyze");
    expect(source).toContain("/api/internal/workflows/rss/backlog");
    expect(source).toContain("/webhook/research-v1");
    expect(source).toContain("/webhook/rss-intake-run-v1");
    expect(source).toContain("brandQuery");
    expect(source).toContain("timingSafeEqual");
    expect(source).toContain("createHmac('sha256'");
    expect(source).toContain("rss-item:");
    expect(source).toContain("rss-deferred-sweep:");
    expect(source).toContain("rss-auto-research:");
  });

  it("claims deferred opportunities before fresh feed items consume the daily limit", () => {
    const workflow = workflowSchema.parse(JSON.parse(readFileSync(workflowPath, "utf8")));
    const serializedConnections = JSON.stringify(workflow.connections);

    expect(serializedConnections).toContain(
      '"Fetch Active Feed Plan":{"main":[[{"node":"Sign Deferred Opportunity Sweep"',
    );
    expect(serializedConnections).toContain(
      '"Claim Deferred Opportunities":{"main":[[{"node":"Decode Deferred Opportunity Sweep"',
    );
    expect(serializedConnections).toContain(
      '"Decode Deferred Opportunity Sweep":{"main":[[{"node":"Prepare Deferred Opportunities"',
    );
    expect(serializedConnections).toContain('"node":"Restore Feed Plan"');
    expect(serializedConnections).toContain('"Restore Feed Plan":{"main":[[{"node":"Split Feeds"');
  });

  it("runs once at 01:00 Europe/Berlin", () => {
    const parsed = JSON.parse(readFileSync(workflowPath, "utf8")) as {
      nodes: Array<{ name: string; parameters: unknown }>;
      settings: { timezone?: string };
    };
    const trigger = parsed.nodes.find((node) => node.name === "Daily at 1 AM Berlin");

    expect(trigger?.parameters).toEqual({
      rule: { interval: [{ field: "cronExpression", expression: "0 1 * * *" }] },
    });
    expect(parsed.settings.timezone).toBe("Europe/Berlin");
  });

  it("terminates cleanly when neither the backlog nor the current scan selects an opportunity", () => {
    const deferred = runCodeNode(
      codeNode("wf-01-rss-intake.json", "Prepare Deferred Opportunities"),
      {
        json: { data: { contractVersion: "1.0", selections: [] } },
      },
    );
    const selected = runCodeNode(
      codeNode("wf-01-rss-intake.json", "Prepare Selected Opportunities"),
      {
        input: {
          all: () => [
            {
              json: {
                data: {
                  contractVersion: "1.0",
                  sourceDocumentId: "00000000-0000-4000-8000-000000000001",
                  results: [],
                },
              },
            },
          ],
        },
      },
    );

    expect(deferred).toEqual([{ json: { dispatch: false, reason: "no_deferred_opportunities" } }]);
    expect(selected).toEqual([
      { json: { dispatch: false, reason: "no_newly_selected_opportunities" } },
    ]);

    const parsed = loadWorkflow("wf-01-rss-intake.json");
    expect(parsed.connections["Dispatch Deferred Research?"]).toEqual({
      main: [[{ node: "Research Deferred Draft Verify and Image", type: "main", index: 0 }], []],
    });
    expect(parsed.connections["Dispatch Selected Research?"]).toEqual({
      main: [[{ node: "Research Draft Verify and Image", type: "main", index: 0 }], []],
    });
  });

  it("signs only complete selected opportunities and rejects malformed preparation context", () => {
    const source = codeNode("wf-01-rss-intake.json", "Prepare Selected Opportunities");
    const validItem = {
      researchEligible: true,
      eligibilityReason: "reserved",
      actorId: "00000000-0000-4000-8000-000000000010",
      brandId: "00000000-0000-4000-8000-000000000020",
      opportunityId: "00000000-0000-4000-8000-000000000030",
    };
    const input = (item: Record<string, unknown>) => ({
      all: () => [
        {
          json: {
            data: {
              contractVersion: "1.0",
              sourceDocumentId: "00000000-0000-4000-8000-000000000001",
              results: [item],
            },
          },
        },
      ],
    });
    const env = {
      WORKFLOW_HMAC_SECRET: "x".repeat(32),
      N8N_WEBHOOK_BASE_URL: "https://n8n.example.test",
    };

    const result = runCodeNode(source, { input: input(validItem), env });
    expect(result).toHaveLength(1);
    expect(result[0]?.json.dispatch).toBe(true);
    expect(result[0]?.json.url).toBe("https://n8n.example.test/webhook/research-v1");
    expect(result[0]?.json.signature).toMatch(/^sha256=[0-9a-f]{64}$/);

    expect(() =>
      runCodeNode(source, {
        input: input({ ...validItem, actorId: undefined }),
        env,
      }),
    ).toThrow("Selected RSS opportunity is missing preparation context");
  });

  it("reads every decoded opportunity decision from the n8n 2.21 data envelopes", () => {
    const workflow = workflowSchema.parse(JSON.parse(readFileSync(workflowPath, "utf8")));
    const preparationNode = workflow.nodes.find(
      (node) => node.name === "Prepare Selected Opportunities",
    );

    expect(preparationNode?.parameters.jsCode).toContain(
      "const analysisResults = $input.all().map((input) => input.json.data);",
    );
    expect(preparationNode?.parameters.jsCode).toContain(
      "analysisResults.flatMap((result) => result.results)",
    );
    expect(preparationNode?.parameters.jsCode).not.toContain("$input.first()");
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
    expect(route).toContain("createSupabaseServiceClient");
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

  it("records and isolates one unavailable feed without cancelling the other feeds", () => {
    const raw = JSON.parse(readFileSync(workflowPath, "utf8")) as {
      nodes: Array<{ name: string; onError?: string }>;
    };
    const fetchNode = raw.nodes.find((node) => node.name === "Fetch and Parse Feed Safely");
    const fetchRoute = readFileSync(
      `${appDirectory}api/internal/workflows/rss/fetch/route.ts`,
      "utf8",
    );

    expect(fetchNode?.onError).toBe("continueErrorOutput");
    expect(
      loadWorkflow("wf-01-rss-intake.json").connections["Fetch and Parse Feed Safely"],
    ).toEqual({
      main: [[{ node: "Decode RSS JSON", type: "main", index: 0 }], []],
    });
    expect(fetchRoute).toContain('status: "failed"');
    expect(fetchRoute).toContain("errorCode: error.code");
  });

  it("reconsiders only signed, recent, unprepared RSS opportunities", () => {
    const route = readFileSync(
      `${appDirectory}api/internal/workflows/rss/backlog/route.ts`,
      "utf8",
    );
    const selector = readFileSync(
      fileURLToPath(new URL("../../../apps/web/lib/rss-deferred-candidates.ts", import.meta.url)),
      "utf8",
    );

    expect(route).toContain("authenticateWorkflowRequest");
    expect(route).toContain('rpc("reserve_rss_generation"');
    expect(route).toContain('eq("generation_policy", "score_then_research")');
    expect(route).toContain('eq("automatic_opportunity_selection", true)');
    expect(route).toContain("selectDeferredRssCandidates");
    expect(route).toContain("classifyDeferredRssProgress");
    expect(route).toContain("existingReservationRunId");
    expect(selector).toContain("blockedOpportunityIds");
    expect(selector).toContain("rssSourceDocumentIds");
    expect(selector).toContain("maximumAgeHours ?? 24");
  });
});

describe("Milestone 4 n8n workflow package", () => {
  it("contains no unreachable workflow nodes", () => {
    for (const filename of [
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
    ]) {
      const parsed = loadWorkflow(filename);
      const startNames = parsed.nodes
        .filter(
          (node) =>
            node.type.endsWith(".webhook") ||
            node.type.endsWith(".scheduleTrigger") ||
            node.type.endsWith(".errorTrigger"),
        )
        .map((node) => node.name);
      const reachable = new Set(startNames);
      const pending = [...startNames];
      while (pending.length) {
        const current = pending.shift()!;
        const outputs = (
          parsed.connections[current] as
            | { main?: Array<Array<{ node: string }> | undefined> }
            | undefined
        )?.main;
        for (const connection of outputs?.flatMap((output) => output ?? []) ?? []) {
          if (!reachable.has(connection.node)) {
            reachable.add(connection.node);
            pending.push(connection.node);
          }
        }
      }

      expect(
        parsed.nodes.filter((node) => !reachable.has(node.name)).map((node) => node.name),
      ).toEqual([]);
    }
  });

  it("decodes every non-terminal file response before downstream processing", () => {
    for (const filename of [
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
    ]) {
      const workflow = workflowSchema.parse(
        JSON.parse(readFileSync(`${workflowDirectory}${filename}`, "utf8")),
      );
      const nodesByName = new Map(workflow.nodes.map((node) => [node.name, node]));

      for (const node of workflow.nodes.filter(
        (candidate) => candidate.type === "n8n-nodes-base.httpRequest",
      )) {
        const response = node.parameters.options as
          | { response?: { response?: { responseFormat?: string } } }
          | undefined;
        const format = response?.response?.response?.responseFormat;
        const connection = workflow.connections[node.name] as
          | { main?: Array<Array<{ node: string }>> }
          | undefined;
        const targets = connection?.main?.flat() ?? [];

        if (format === "file" && targets.length) {
          expect(nodesByName.get(targets[0]!.node)?.type).toBe("n8n-nodes-base.extractFromFile");
        }
      }
    }
  });

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
    expect(rssAnalyze).toContain("actorId,");
    expect(rssAnalyze).toContain("originalUrl: source.canonical_url");
    expect(rssAnalyze).toContain("new Date(source.published_at).toISOString()");
    expect(rssAnalyze).toContain("createDailyRssReservationIdentity");
    expect(rssAnalyze).toContain("requestHash: reservationIdentity.requestHash");
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
    expect(source).toContain("/webhook/editorial-generation-v1");
    expect(source).toContain("newsworthy_authority");
    expect(source).toContain("educational_breakdown");
    expect(source).toContain("perspective_conversation");
    expect(source).toContain("readyForWriting");
    expect(source).toContain("createHmac('sha256'");
    expect(source).toContain("timingSafeEqual");
    expect(source).not.toMatch(/service[_-]?role|credentialId|OPENAI_API_KEY|system prompt/i);
  });

  it("reads the decoded research response from the n8n 2.21 data envelope", () => {
    const workflow = workflowSchema.parse(
      JSON.parse(readFileSync(`${workflowDirectory}wf-05-research.json`, "utf8")),
    );
    const codeByNode = new Map(
      workflow.nodes
        .filter((node) => node.type === "n8n-nodes-base.code")
        .map((node) => [node.name, z.object({ jsCode: z.string() }).parse(node.parameters).jsCode]),
    );

    expect(codeByNode.get("Sign Three-style Draft Request")).toContain(
      "const research = $input.first().json.data;",
    );
    expect(codeByNode.has("Sign Draft Verification Requests")).toBe(false);
    expect(codeByNode.has("Sign Ready Draft Image Requests")).toBe(false);
  });

  it("isolates each paid style call and surfaces a rejected handoff for durable recovery", () => {
    const rawWorkflow = JSON.parse(
      readFileSync(`${workflowDirectory}wf-05-research.json`, "utf8"),
    ) as {
      nodes: Array<{ name: string; onError?: string; parameters: unknown }>;
    };
    const workflow = workflowSchema.parse(rawWorkflow);
    const codeByNode = new Map(
      workflow.nodes
        .filter((node) => node.type === "n8n-nodes-base.code")
        .map((node) => [node.name, z.object({ jsCode: z.string() }).parse(node.parameters).jsCode]),
    );
    const generation = codeByNode.get("Sign Three-style Draft Request");
    const dispatch = rawWorkflow.nodes.find((node) => node.name === "Generate Three Draft Styles");

    expect(generation).toContain("return styles.map((contentStyle) =>");
    expect(generation).toContain("contentStyles: [contentStyle]");
    expect(generation).toContain(
      "idempotencyKey: `rss-auto-drafts:${request.opportunityId}:${contentStyle}`",
    );
    expect(dispatch?.onError).toBeUndefined();
    expect(JSON.stringify(dispatch?.parameters)).toContain('"neverError":false');
    expect(workflow.connections["Generate Three Draft Styles"]).toBeUndefined();
    expect(
      workflow.nodes.every((node) =>
        [
          "Decode Draft Set",
          "Sign Draft Verification Requests",
          "Verify Drafts",
          "Decode Verification Results",
          "Sign Ready Draft Image Requests",
          "Generate Branded Images",
        ].every((removed) => node.name !== removed),
      ),
    ).toBe(true);
  });

  it("connects every recoverable child to the next unattended stage", () => {
    const research = workflowSchema.parse(
      JSON.parse(readFileSync(`${workflowDirectory}wf-05-research.json`, "utf8")),
    );
    const editorial = workflowSchema.parse(
      JSON.parse(readFileSync(`${workflowDirectory}wf-06-angle-post-generation.json`, "utf8")),
    );
    const verification = workflowSchema.parse(
      JSON.parse(readFileSync(`${workflowDirectory}wf-07-post-verification.json`, "utf8")),
    );
    const connectionSchema = z.object({
      main: z.array(z.array(z.object({ node: z.string() }))),
    });
    const targetNames = (workflow: z.infer<typeof workflowSchema>, sourceName: string) =>
      connectionSchema
        .parse(workflow.connections[sourceName])
        .main.flat()
        .map((connection) => connection.node);

    expect(targetNames(research, "Decode Research Result")).toEqual([
      "Sign Three-style Draft Request",
    ]);
    expect(targetNames(research, "Sign Three-style Draft Request")).toEqual([
      "Dispatch Editorial Generation?",
    ]);
    expect(targetNames(research, "Dispatch Editorial Generation?")).toEqual([
      "Generate Three Draft Styles",
    ]);
    expect(targetNames(editorial, "Generate Evaluate and Persist Posts")).toEqual([
      "Sign Verification Handoff",
    ]);
    expect(targetNames(editorial, "Sign Verification Handoff")).toEqual([
      "Dispatch Verification Handoff",
    ]);
    expect(targetNames(verification, "Reevaluate and Persist Readiness")).toEqual([
      "Sign Image Handoff",
    ]);
    expect(targetNames(verification, "Sign Image Handoff")).toEqual(["Dispatch Image Generation?"]);
    expect(targetNames(verification, "Dispatch Image Generation?")).toEqual([
      "Dispatch Image Handoff",
    ]);
  });

  it("acknowledges autonomous stage intake before paid work begins", () => {
    for (const filename of [
      "wf-05-research.json",
      "wf-06-angle-post-generation.json",
      "wf-07-post-verification.json",
      "wf-08-image-generation.json",
    ]) {
      const parsed = loadWorkflow(filename);
      const webhook = parsed.nodes.find((node) => node.type === "n8n-nodes-base.webhook");

      expect(webhook?.parameters.responseMode).toBe("onReceived");
      expect(webhook?.parameters.options).toEqual({ responseCode: 202 });
    }
  });

  it("bounds every autonomous n8n-to-n8n acceptance handoff at 30 seconds", () => {
    for (const [filename, nodeNames] of [
      [
        "wf-01-rss-intake.json",
        ["Research Deferred Draft Verify and Image", "Research Draft Verify and Image"],
      ],
      ["wf-05-research.json", ["Generate Three Draft Styles"]],
      ["wf-06-angle-post-generation.json", ["Dispatch Verification Handoff"]],
      ["wf-07-post-verification.json", ["Dispatch Image Handoff"]],
    ] as const) {
      const parsed = loadWorkflow(filename);
      for (const name of nodeNames) {
        const node = parsed.nodes.find((candidate) => candidate.name === name);
        expect((node?.parameters.options as { timeout?: number } | undefined)?.timeout).toBe(
          30_000,
        );
      }
    }
  });

  it("treats bounded research that is not ready for writing as a successful terminal outcome", () => {
    const result = runCodeNode(codeNode("wf-05-research.json", "Sign Three-style Draft Request"), {
      input: {
        first: () => ({
          json: {
            data: {
              contractVersion: "1.0",
              researchRunId: "00000000-0000-4000-8000-000000000001",
              generationRunId: "00000000-0000-4000-8000-000000000002",
              readyForWriting: false,
            },
          },
        }),
      },
      lookup: () => ({
        first: () => ({
          json: {
            body: {
              correlationId: "00000000-0000-4000-8000-000000000003",
              opportunityId: "00000000-0000-4000-8000-000000000004",
            },
          },
        }),
      }),
    });

    expect(result).toEqual([
      { json: { dispatch: false, reason: "research_not_ready_for_writing" } },
    ]);
    expect(
      loadWorkflow("wf-05-research.json").connections["Dispatch Editorial Generation?"],
    ).toEqual({
      main: [[{ node: "Generate Three Draft Styles", type: "main", index: 0 }], []],
    });
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

  it("does not call image generation when verification requires editorial review", () => {
    const postDraftId = "00000000-0000-4000-8000-000000000001";
    const result = runCodeNode(codeNode("wf-07-post-verification.json", "Sign Image Handoff"), {
      input: {
        first: () => ({
          json: {
            contractVersion: "1.0",
            postDraftId,
            postVersionId: "00000000-0000-4000-8000-000000000002",
            evaluation: { readyForReview: false },
          },
        }),
      },
      lookup: () => ({
        first: () => ({
          json: {
            body: {
              postDraftId,
              correlationId: "00000000-0000-4000-8000-000000000003",
            },
          },
        }),
      }),
    });

    expect(result).toEqual([{ json: { dispatch: false, reason: "draft_not_ready_for_image" } }]);
    expect(
      loadWorkflow("wf-07-post-verification.json").connections["Dispatch Image Generation?"],
    ).toEqual({
      main: [[{ node: "Dispatch Image Handoff", type: "main", index: 0 }], []],
    });
  });

  it("fails rejected verification and image handoffs so WF-10 can recover them", () => {
    for (const [filename, nodeName] of [
      ["wf-06-angle-post-generation.json", "Dispatch Verification Handoff"],
      ["wf-07-post-verification.json", "Dispatch Image Handoff"],
    ] as const) {
      const raw = JSON.parse(readFileSync(`${workflowDirectory}${filename}`, "utf8")) as {
        nodes: Array<{
          name: string;
          onError?: string;
          parameters: { options?: { response?: { response?: { neverError?: boolean } } } };
        }>;
      };
      const node = raw.nodes.find((candidate) => candidate.name === nodeName);

      expect(node?.onError).toBeUndefined();
      expect(node?.parameters.options?.response?.response?.neverError).toBe(false);
    }
  });

  it("excludes the current draft from verification and regeneration similarity", () => {
    const source = readFileSync(editorialWorkflowPath, "utf8");

    expect(source).toContain('draftQuery.neq("id", excludePostDraftId)');
    expect(
      source.match(/getSimilarityContext\(input\.brandId, input\.postDraftId\)/g),
    ).toHaveLength(2);
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
    expect(route).toContain('await import("@/lib/image-workflows")');
    expect(route).toContain('typeof error === "object"');
    expect(route).not.toContain("error instanceof Error");
    expect(readFileSync(`${appDirectory}../lib/image-workflows.ts`, "utf8")).toContain(
      "await preflightImageCompositor()",
    );
    const compositor = readFileSync(imageCompositorPath, "utf8");
    expect(compositor).toContain('await import("opentype.js")');
    expect(compositor).not.toContain("createRequire(import.meta.url)");
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
    expect(publisher).toContain("/workflows/${encodeURIComponent(workflowId)}/deactivate");
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

  it("cannot turn a dispatcher or persistence outage into a recurring WF-10 error", () => {
    const workflow = JSON.parse(
      readFileSync(`${workflowDirectory}wf-10-error-recovery.json`, "utf8"),
    ) as {
      nodes: Array<{
        name: string;
        onError?: string;
        parameters: {
          jsCode?: string;
          options?: {
            response?: {
              response?: {
                fullResponse?: boolean;
                neverError?: boolean;
                responseFormat?: string;
              };
            };
          };
        };
      }>;
    };
    const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));

    for (const name of ["Persist Redacted Failure", "Dispatch Due Recoveries"]) {
      const node = nodes.get(name);
      expect(node?.onError).toBe("continueRegularOutput");
      expect(node?.parameters.options?.response?.response).toMatchObject({
        fullResponse: true,
        neverError: true,
        responseFormat: "json",
      });
    }
    expect(nodes.get("Sign Due Recovery Poll")?.parameters.jsCode).toContain(
      "throw new Error('Recovery poll environment is not configured')",
    );
    const applicationFailureFilter = nodes.get("Ignore Application-recorded Failures");
    expect(applicationFailureFilter?.parameters.jsCode).toContain("applicationRecordedNodes.has");
    expect(applicationFailureFilter?.parameters.jsCode).toContain("transportFailure");
    expect(applicationFailureFilter?.parameters.jsCode).toContain("persist: false");
    expect(applicationFailureFilter?.parameters.jsCode).toContain(
      "Generate Evaluate and Persist Posts",
    );
    expect(applicationFailureFilter?.parameters.jsCode).toContain(
      "Direct Generate Validate Compose and Persist",
    );
    expect(
      loadWorkflow("wf-10-error-recovery.json").connections["Persist Workflow Failure?"],
    ).toEqual({
      main: [[{ node: "Classify and Sign Failure", type: "main", index: 0 }], []],
    });
  });

  it("records gateway timeouts even when they occur at an application-owned node", () => {
    const source = codeNode("wf-10-error-recovery.json", "Ignore Application-recorded Failures");
    const payload = (message: string) => ({
      execution: {
        lastNodeExecuted: "Run and Persist Bounded Research",
        error: { message },
      },
    });
    const execute = (message: string) => {
      const value = payload(message);
      return runCodeNode(source, {
        json: value,
        input: { all: () => [{ json: value }] },
      });
    };

    expect(execute("Gateway timed out - Inactivity Timeout")[0]?.json.persist).toBe(true);
    expect(execute("Research validation rejected")[0]?.json).toEqual({
      persist: false,
      reason: "application_failure_already_recorded",
    });
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
        .object({ timeout: z.number().int().min(1_000).max(600_000) })
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
