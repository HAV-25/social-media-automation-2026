import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const expectedWorkflowNames = [
  "WF-01 RSS Intake",
  "WF-02 Manual Intake",
  "WF-03 Normalize",
  "WF-04 Cluster and Score",
  "WF-05 Research",
  "WF-06 Angle and Post Generation",
  "WF-07 Post Verification",
  "WF-08 Image Generation",
  "WF-09 Content Actions",
  "WF-10 Error and Recovery",
];

export function parseEnv(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    values[key] = rawValue.replace(/^(["'])(.*)\1$/, "$2").trim();
  }
  return values;
}

async function envFile(path) {
  try {
    return parseEnv(await readFile(resolve(path), "utf8"));
  } catch {
    return {};
  }
}

function requireKeys(values, keys, sourceLabel) {
  const missing = keys.filter((key) => !values[key]);
  return missing.map((key) => `${sourceLabel}: ${key}`);
}

function localChecks(app, publisher) {
  const issues = [
    ...requireKeys(
      app,
      [
        "NEXT_PUBLIC_APP_URL",
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_SECRET_KEY",
        "WORKFLOW_HMAC_SECRET",
      ],
      ".env.local",
    ),
    ...requireKeys(
      publisher,
      ["N8N_API_URL", "N8N_API_KEY", "N8N_PROJECT_ID", "N8N_FOLDER_ID"],
      ".env.n8n.local",
    ),
  ];
  if (app.WORKFLOW_HMAC_SECRET && app.WORKFLOW_HMAC_SECRET.length < 32) {
    issues.push(".env.local: WORKFLOW_HMAC_SECRET must contain at least 32 characters");
  }
  if (app.WORKFLOW_HMAC_SECRET && app.WORKFLOW_HMAC_PREVIOUS_SECRET === app.WORKFLOW_HMAC_SECRET) {
    issues.push(".env.local: active and previous workflow secrets must differ");
  }
  return issues;
}

async function remoteWorkflowChecks(publisher) {
  const baseUrl = publisher.N8N_API_URL.replace(/\/+$/, "");
  const query = new URLSearchParams({ limit: "250", projectId: publisher.N8N_PROJECT_ID });
  const response = await fetch(`${baseUrl}/api/v1/workflows?${query}`, {
    headers: { "X-N8N-API-KEY": publisher.N8N_API_KEY },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`n8n workflow inventory returned HTTP ${response.status}`);
  const payload = await response.json();
  const workflows = Array.isArray(payload.data) ? payload.data : [];
  const matching = workflows.filter((workflow) => expectedWorkflowNames.includes(workflow.name));
  const duplicateNames = expectedWorkflowNames.filter(
    (name) => matching.filter((workflow) => workflow.name === name).length > 1,
  );
  const missingNames = expectedWorkflowNames.filter(
    (name) => !matching.some((workflow) => workflow.name === name),
  );
  const inactiveNames = matching
    .filter((workflow) => !workflow.active)
    .map((workflow) => workflow.name)
    .sort();
  return { duplicateNames, inactiveNames, missingNames };
}

export async function checkRuntimeBridge({ remote = false } = {}) {
  const [app, publisher] = await Promise.all([envFile(".env.local"), envFile(".env.n8n.local")]);
  const issues = localChecks(app, publisher);
  let remoteState = null;
  if (remote && issues.length === 0) {
    remoteState = await remoteWorkflowChecks(publisher);
    issues.push(
      ...remoteState.duplicateNames.map((name) => `n8n duplicate workflow: ${name}`),
      ...remoteState.missingNames.map((name) => `n8n missing workflow: ${name}`),
    );
  }
  return {
    ok: issues.length === 0,
    issues,
    remoteState,
    requiredN8nRuntimeKeys: [
      "APP_BASE_URL",
      "N8N_WEBHOOK_BASE_URL",
      "WORKFLOW_HMAC_SECRET",
      "NODE_FUNCTION_ALLOW_BUILTIN",
    ],
  };
}

async function main() {
  const result = await checkRuntimeBridge({ remote: process.argv.includes("--remote") });
  if (result.remoteState) {
    const inactive =
      result.remoteState.inactiveNames.length > 0
        ? result.remoteState.inactiveNames.join(", ")
        : "none";
    console.log(`Remote inactive workflows: ${inactive}`);
  }
  console.log(`Required n8n runtime keys: ${result.requiredN8nRuntimeKeys.join(", ")}`);
  if (!result.ok) {
    for (const issue of result.issues) console.error(`Missing or invalid configuration: ${issue}`);
    process.exitCode = 1;
    return;
  }
  console.log("Runtime bridge preflight passed without disclosing credential values.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Runtime bridge preflight failed safely.",
    );
    process.exitCode = 1;
  });
}
