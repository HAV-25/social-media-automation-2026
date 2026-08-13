import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/* global URLSearchParams, console, fetch, process */

const root = resolve(import.meta.dirname, "..");
const legacyWorkflowDirectory = resolve(root, "n8n", "workflows");
const lightweightWorkflowDirectory = resolve(root, "n8n", "lightweight");
const defaultFiles = [
  "wf-10-error-recovery.json",
  "wf-01-rss-intake.json",
  "wf-02-manual-intake.json",
  "wf-03-normalize.json",
  "wf-04-cluster-score.json",
  "wf-05-research.json",
  "wf-06-angle-post-generation.json",
  "wf-07-post-verification.json",
  "wf-08-image-generation.json",
  "wf-09-content-actions.json",
];
const recoverableWorkflowNames = new Set([
  "WF-05 Research",
  "WF-06 Angle and Post Generation",
  "WF-07 Post Verification",
  "WF-08 Image Generation",
  "WF-09 Content Actions",
]);
const lightweightFiles = [
  "lw-01-daily-intake.json",
  "lw-02-research-worker.json",
  "lw-03-draft-verification-worker.json",
  "lw-04-image-package-worker.json",
  "lw-05-retry-recovery.json",
];

export function parseEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^(['"])(.*)\1$/, "$2");
        return [key, value];
      }),
  );
}

async function localConfiguration() {
  let fileValues = {};
  try {
    fileValues = parseEnv(await readFile(resolve(root, ".env.n8n.local"), "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return {
    apiUrl: process.env.N8N_API_URL || fileValues.N8N_API_URL,
    apiKey: process.env.N8N_API_KEY || fileValues.N8N_API_KEY,
    projectId: process.env.N8N_PROJECT_ID || fileValues.N8N_PROJECT_ID,
    folderId: process.env.N8N_FOLDER_ID || fileValues.N8N_FOLDER_ID,
  };
}

export function workflowPayload(workflow, placement = {}, errorWorkflowId) {
  return {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: {
      ...workflow.settings,
      ...(errorWorkflowId ? { errorWorkflow: errorWorkflowId } : {}),
    },
    ...placement,
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

export function equivalent(left, right, errorWorkflowId) {
  return (
    JSON.stringify(stable(workflowPayload(left, {}, errorWorkflowId))) ===
    JSON.stringify(stable(workflowPayload(right)))
  );
}

function apiClient(apiUrl, apiKey) {
  const base = apiUrl.replace(/\/+$/, "");
  return async function request(path, options = {}) {
    const response = await fetch(`${base}/api/v1${path}`, {
      ...options,
      headers: {
        "content-type": "application/json",
        "X-N8N-API-KEY": apiKey,
        ...options.headers,
      },
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const detail = [body?.code, body?.message]
        .filter((value) => typeof value === "string")
        .join(": ")
        .replace(/(?:bearer|api[_ -]?key|sk-)\s*[^\s,;]+/gi, "[redacted]")
        .replace(/[^\x20-\x7e]/g, " ")
        .slice(0, 300);
      throw new Error(
        `n8n API ${options.method ?? "GET"} ${path} failed (${response.status})${detail ? `: ${detail}` : "."}`,
      );
    }
    return body;
  };
}

async function supportsFolderPlacementOnCreate(apiUrl) {
  const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/v1/docs/swagger-ui-init.js`, {
    cache: "no-store",
  });
  if (!response.ok) return false;
  const specification = await response.text();
  const start = specification.indexOf('"workflowCreate":');
  const end = specification.indexOf('"workflowVersion":', start);
  return start >= 0 && end > start && specification.slice(start, end).includes('"parentFolderId"');
}

async function listWorkflows(request, projectId) {
  const workflows = [];
  let cursor;
  do {
    const query = new URLSearchParams({ limit: "250", projectId });
    if (cursor) query.set("cursor", cursor);
    const page = await request(`/workflows?${query}`);
    workflows.push(...(page.data ?? []));
    cursor = page.nextCursor;
  } while (cursor);
  return workflows;
}

export function selectedProfile(argumentsList) {
  const profile = argumentsList.find((argument) => argument.startsWith("--profile="));
  const value = profile?.slice("--profile=".length) ?? "legacy";
  if (!new Set(["legacy", "lightweight"]).has(value)) {
    throw new Error("--profile must be legacy or lightweight.");
  }
  return value;
}

export function selectedFiles(argumentsList, profile) {
  const requested = argumentsList.find((argument) => argument.startsWith("--files="));
  if (!requested) return profile === "lightweight" ? lightweightFiles : defaultFiles;
  const files = requested
    .slice("--files=".length)
    .split(",")
    .map((file) => file.trim())
    .filter(Boolean);
  const allowedPattern =
    profile === "lightweight"
      ? /^lw-0[1-5][a-z0-9-]*\.json$/
      : /^wf-(?:0[1-9]|10)[a-z0-9-]*\.json$/;
  if (!files.length || files.some((file) => !allowedPattern.test(file))) {
    throw new Error(`--files contains a filename outside the ${profile} workflow profile.`);
  }
  return files;
}

export async function publishWorkflows({
  apiUrl,
  apiKey,
  projectId,
  folderId,
  files = defaultFiles,
  workflowDirectory = legacyWorkflowDirectory,
  linkRecoveryWorkflow = true,
  apply = false,
  publish = false,
}) {
  if (!apiUrl || !apiKey || !projectId || !folderId) {
    throw new Error(
      "N8N_API_URL, N8N_API_KEY, N8N_PROJECT_ID, and N8N_FOLDER_ID are required in .env.n8n.local.",
    );
  }
  if (publish && !apply) throw new Error("Publication requires --apply.");
  const request = apiClient(apiUrl, apiKey);
  const supportsCreateFolder = await supportsFolderPlacementOnCreate(apiUrl);
  await request(
    `/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(folderId)}`,
  );
  const remote = await listWorkflows(request, projectId);
  const results = [];
  const plansWf10Creation =
    linkRecoveryWorkflow && !apply && files.includes("wf-10-error-recovery.json");
  let errorWorkflowId = linkRecoveryWorkflow
    ? remote.find((workflow) => workflow.name === "WF-10 Error and Recovery")?.id
    : undefined;
  for (const filename of files) {
    const local = JSON.parse(await readFile(resolve(workflowDirectory, filename), "utf8"));
    const matches = remote.filter((workflow) => workflow.name === local.name);
    if (matches.length > 1) {
      throw new Error(`Refusing to update duplicate remote workflows named "${local.name}".`);
    }
    const current = matches[0];
    const linkedErrorWorkflowId =
      linkRecoveryWorkflow && recoverableWorkflowNames.has(local.name)
        ? (errorWorkflowId ?? (plansWf10Creation ? "<created-WF-10-id>" : undefined))
        : undefined;
    if (
      linkRecoveryWorkflow &&
      recoverableWorkflowNames.has(local.name) &&
      !linkedErrorWorkflowId
    ) {
      throw new Error("WF-10 Error and Recovery must be published before recoverable workflows.");
    }
    const action = !current
      ? "create"
      : equivalent(local, current, linkedErrorWorkflowId)
        ? "unchanged"
        : "update";
    let workflowId = current?.id;
    if (apply && action === "create") {
      if (publish && !supportsCreateFolder) {
        throw new Error(
          "This n8n version requires inactive project staging and verified UI folder placement before publication.",
        );
      }
      workflowId = (
        await request("/workflows", {
          method: "POST",
          body: JSON.stringify(
            workflowPayload(
              local,
              {
                projectId,
                ...(supportsCreateFolder ? { parentFolderId: folderId } : {}),
              },
              linkedErrorWorkflowId,
            ),
          ),
        })
      ).id;
    } else if (apply && current) {
      await request(`/workflows/${encodeURIComponent(workflowId)}`, {
        method: "PUT",
        body: JSON.stringify(workflowPayload(local, {}, linkedErrorWorkflowId)),
      });
    }
    if (linkRecoveryWorkflow && local.name === "WF-10 Error and Recovery" && workflowId) {
      errorWorkflowId = workflowId;
    }
    if (apply && publish && workflowId && current?.active && action === "update") {
      await request(`/workflows/${encodeURIComponent(workflowId)}/deactivate`, { method: "POST" });
    }
    if (
      apply &&
      publish &&
      workflowId &&
      (!current?.active || (current.active && action === "update"))
    ) {
      await request(`/workflows/${encodeURIComponent(workflowId)}/activate`, { method: "POST" });
    }
    results.push({
      name: local.name,
      action,
      destination: `${projectId}/${folderId}`,
      active: current?.active ?? false,
      published: Boolean(apply && publish),
      workflowId: workflowId ?? null,
      folderPlacement:
        current || supportsCreateFolder
          ? "verify-in-target"
          : apply
            ? "staged-in-project"
            : "pending",
    });
  }
  return results;
}

async function main() {
  const configuration = await localConfiguration();
  const argumentsList = process.argv.slice(2);
  const profile = selectedProfile(argumentsList);
  const apply = process.argv.includes("--apply");
  const publish = process.argv.includes("--publish");
  if (profile === "lightweight" && publish) {
    throw new Error(
      "Lightweight workflows must be imported inactive. Activate them only during the approval-gated cutover.",
    );
  }
  const results = await publishWorkflows({
    ...configuration,
    files: selectedFiles(argumentsList, profile),
    workflowDirectory:
      profile === "lightweight" ? lightweightWorkflowDirectory : legacyWorkflowDirectory,
    linkRecoveryWorkflow: profile === "legacy",
    apply,
    publish,
  });
  console.table(results);
  console.log(apply ? "n8n workflow publication completed." : "Dry run only; no n8n changes made.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "n8n workflow publication failed.");
    process.exitCode = 1;
  });
}
