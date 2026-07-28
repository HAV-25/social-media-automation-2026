import "server-only";
import {
  serverEnvSchema,
  workflowRecoveryExecutionSchema,
  type WorkflowRecoveryFailure,
} from "@content-engine/contracts";
import { randomUUID } from "node:crypto";
import { sha256Hex, signWorkflowRequest } from "@content-engine/security";
import { z } from "zod";
import { N8nRecoveryClient, N8nRecoveryError } from "./n8n-recovery-client";
import { safeWorkflowFailure } from "./recovery-core";
import { createSupabaseServiceClient } from "./supabase/service";

const registrationResultSchema = z.object({
  recoveryId: z.uuid(),
  generationRunId: z.uuid(),
  duplicate: z.boolean(),
});

const claimSchema = z.object({
  recovery_id: z.uuid(),
  generation_run_id: z.uuid(),
  target: z.enum([
    "research",
    "editorial_generation",
    "post_verification",
    "image_generation",
    "content_action",
  ]),
  request_payload: z.unknown(),
  attempt_count: z.number().int().min(1).max(3),
});

const targetPaths = {
  research: "/api/internal/workflows/research",
  editorial_generation: "/api/internal/workflows/posts/generate",
  post_verification: "/api/internal/workflows/posts/verify",
  image_generation: "/api/internal/workflows/images/generate",
  content_action: "/api/internal/workflows/posts/actions",
} as const;

async function signedApplicationRequest(path: string, body: string) {
  const env = serverEnvSchema.parse(process.env);
  if (!env.WORKFLOW_HMAC_SECRET) {
    throw new Error("Workflow authentication is not configured.");
  }
  const nonce = randomUUID();
  const timestamp = String(Math.floor(Date.now() / 1000));
  return fetch(new URL(path, env.NEXT_PUBLIC_APP_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-workflow-name": "WF-10 Error and Recovery",
      "x-workflow-nonce": nonce,
      "x-workflow-timestamp": timestamp,
      "x-workflow-signature": signWorkflowRequest(
        { body, method: "POST", nonce, path, timestamp },
        env.WORKFLOW_HMAC_SECRET,
      ),
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(180_000),
  });
}

export async function executeRecoverableWorkflow(raw: unknown) {
  const input = workflowRecoveryExecutionSchema.parse(raw);
  const requestBody = JSON.stringify(input.requestPayload);
  const supabase = createSupabaseServiceClient();
  const common = {
    actorId: input.requestPayload.actorId,
    brandId: input.requestPayload.brandId,
    correlationId: input.requestPayload.correlationId,
    idempotencyKey: input.requestPayload.idempotencyKey,
    requestDigest: sha256Hex(requestBody),
    requestPayload: input.requestPayload,
    target: input.target,
    workflowExecutionId: input.workflowExecutionId,
    workflowName: input.workflowName,
  };
  const { data: registration, error: registrationError } = await supabase
    .rpc("register_workflow_execution", { payload: common })
    .single();
  if (registrationError) throw new Error("Workflow recovery context could not be registered.");
  const registered = registrationResultSchema.parse(registration);

  let response: Response;
  try {
    response = await signedApplicationRequest(targetPaths[input.target], requestBody);
  } catch {
    const failure = safeWorkflowFailure(503, {
      error: { code: "application_target_unavailable" },
    });
    await recordWorkflowFailure({
      contractVersion: "1.0",
      workflowExecutionId: input.workflowExecutionId,
      retryOfExecutionId: null,
      workflowName: input.workflowName,
      errorCode: failure.code,
      category: failure.category,
      retryable: failure.retryable,
      occurredAt: new Date().toISOString(),
    });
    throw new Error("The recoverable application workflow was unavailable.");
  }

  const responseText = await response.text();
  let responseBody: unknown = {};
  try {
    responseBody = responseText ? JSON.parse(responseText) : {};
  } catch {
    const failure = safeWorkflowFailure(502, {
      error: { code: "malformed_upstream_response" },
    });
    await recordWorkflowFailure({
      contractVersion: "1.0",
      workflowExecutionId: input.workflowExecutionId,
      retryOfExecutionId: null,
      workflowName: input.workflowName,
      errorCode: failure.code,
      category: failure.category,
      retryable: failure.retryable,
      occurredAt: new Date().toISOString(),
    });
    return {
      body: { error: { code: failure.code, message: "The workflow response was invalid." } },
      status: 502,
    };
  }
  if (!response.ok) {
    const failure = safeWorkflowFailure(response.status, responseBody);
    await recordWorkflowFailure({
      contractVersion: "1.0",
      workflowExecutionId: input.workflowExecutionId,
      retryOfExecutionId: null,
      workflowName: input.workflowName,
      errorCode: failure.code,
      category: failure.category,
      retryable: failure.retryable,
      occurredAt: new Date().toISOString(),
    });
    return { body: responseBody, status: response.status };
  }

  const { error: completionError } = await supabase.rpc("complete_workflow_execution", {
    payload: {
      workflowExecutionId: input.workflowExecutionId,
      completedAt: new Date().toISOString(),
    },
  });
  if (completionError) throw new Error("Workflow completion could not be persisted.");
  const responseObject =
    typeof responseBody === "object" && responseBody !== null
      ? responseBody
      : { data: responseBody };
  return {
    body: { ...responseObject, recoveryId: registered.recoveryId },
    status: response.status,
  };
}

export async function recordWorkflowFailure(input: WorkflowRecoveryFailure) {
  const { data, error } = await createSupabaseServiceClient()
    .rpc("record_workflow_failure", {
      payload: {
        ...input,
        retryOfExecutionId: input.retryOfExecutionId ?? "",
      },
    })
    .single();
  if (error) throw new Error("Workflow failure could not be persisted.");
  return data;
}

export async function dispatchDueRecoveries(limit: number) {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("claim_due_recovery_replays", {
    requested_limit: limit,
  });
  if (error) throw new Error("Due recoveries could not be claimed.");
  const claims = z.array(claimSchema).parse(data ?? []);
  const results = [];
  for (const claim of claims) {
    try {
      const client = new N8nRecoveryClient();
      const replay = await client.replayWorkflow(claim.target, claim.request_payload);
      results.push({
        recoveryId: claim.recovery_id,
        status: "replay_accepted",
        attemptCount: claim.attempt_count,
        replay,
      });
    } catch (error) {
      const code =
        error instanceof N8nRecoveryError ? error.code : "recovery_dispatch_persistence_failed";
      const { error: failurePersistenceError } = await supabase.rpc("fail_recovery_dispatch", {
        payload: {
          recoveryId: claim.recovery_id,
          generationRunId: claim.generation_run_id,
          errorCode: code,
        },
      });
      if (failurePersistenceError) {
        results.push({
          recoveryId: claim.recovery_id,
          status: "dispatch_state_unknown",
          code: "recovery_failure_persistence_failed",
        });
        continue;
      }
      results.push({ recoveryId: claim.recovery_id, status: "dispatch_failed", code });
    }
  }
  return results;
}
