import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parseEnv } from "./publish-n8n-workflows.mjs";

/* global URLSearchParams, console, fetch, process */

const root = resolve(import.meta.dirname, "..");
const recurringLegacyNames = new Set(["WF-01 RSS Intake", "WF-10 Error and Recovery"]);

async function configuration() {
  const values = parseEnv(await readFile(resolve(root, ".env.n8n.local"), "utf8"));
  const required = ["N8N_API_URL", "N8N_API_KEY", "N8N_PROJECT_ID"];
  if (required.some((key) => !values[key])) {
    throw new Error(`${required.join(", ")} are required in .env.n8n.local.`);
  }
  return values;
}

function client(apiUrl, apiKey) {
  const baseUrl = apiUrl.replace(/\/+$/, "");
  return async (path, options = {}) => {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      ...options,
      headers: { "X-N8N-API-KEY": apiKey, ...options.headers },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`n8n API ${options.method ?? "GET"} ${path} failed (${response.status}).`);
    }
    return body;
  };
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

async function main() {
  const values = await configuration();
  const request = client(values.N8N_API_URL, values.N8N_API_KEY);
  const workflows = await listWorkflows(request, values.N8N_PROJECT_ID);
  const recurring = workflows.filter((workflow) => recurringLegacyNames.has(workflow.name));
  const duplicateNames = [...recurringLegacyNames].filter(
    (name) => recurring.filter((workflow) => workflow.name === name).length > 1,
  );
  if (duplicateNames.length) {
    throw new Error(`Refusing to mutate duplicate workflow names: ${duplicateNames.join(", ")}.`);
  }

  if (process.argv.includes("--apply")) {
    for (const workflow of recurring.filter((item) => item.active)) {
      await request(`/workflows/${encodeURIComponent(workflow.id)}/deactivate`, { method: "POST" });
    }
  }

  const refreshed = await listWorkflows(request, values.N8N_PROJECT_ID);
  const status = refreshed
    .filter((workflow) => recurringLegacyNames.has(workflow.name))
    .map((workflow) => ({ id: workflow.id, name: workflow.name, active: workflow.active }));
  console.table(status);
  const executions = await request("/executions?status=running&limit=100");
  const recurringIds = new Set(status.map((workflow) => workflow.id));
  const running = (executions.data ?? [])
    .filter((execution) => recurringIds.has(execution.workflowId))
    .map((execution) => ({
      id: execution.id,
      workflowId: execution.workflowId,
      startedAt: execution.startedAt,
      status: execution.status,
    }));
  console.table(running);
  if (status.length !== recurringLegacyNames.size || status.some((workflow) => workflow.active)) {
    process.exitCode = 1;
    return;
  }
  if (running.length) {
    console.log(
      "A recurring legacy execution is still running. It will not be replaced by another scheduled run.",
    );
    process.exitCode = 2;
    return;
  }
  console.log("Recurring legacy RSS and recovery triggers are inactive.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Legacy n8n pause failed.");
  process.exitCode = 1;
});
