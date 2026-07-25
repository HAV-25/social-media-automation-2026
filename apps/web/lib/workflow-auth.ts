import "server-only";
import { serverEnvSchema } from "@content-engine/contracts";
import {
  verifyWorkflowRequest,
  workflowHeadersSchema,
  type WorkflowHeaders,
} from "@content-engine/security";
import { ApiRateLimitError, enforceInternalApiRateLimit } from "./api-rate-limit";
import { createSupabaseServiceClient } from "./supabase/service";

export class WorkflowAuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 409 | 429 | 503,
    readonly code: string,
  ) {
    super(message);
  }
}

function readWorkflowHeaders(headers: Headers): WorkflowHeaders {
  const parsed = workflowHeadersSchema.safeParse({
    "x-workflow-name": headers.get("x-workflow-name"),
    "x-workflow-nonce": headers.get("x-workflow-nonce"),
    "x-workflow-signature": headers.get("x-workflow-signature"),
    "x-workflow-timestamp": headers.get("x-workflow-timestamp"),
  });

  if (!parsed.success) {
    throw new WorkflowAuthError(
      "Workflow authentication headers are invalid.",
      401,
      "invalid_headers",
    );
  }
  return parsed.data;
}

export async function authenticateWorkflowRequest(request: Request, rawBody: string) {
  const env = serverEnvSchema.parse(process.env);
  if (!env.WORKFLOW_HMAC_SECRET) {
    throw new WorkflowAuthError(
      "Workflow authentication is not configured.",
      503,
      "workflow_auth_unavailable",
    );
  }

  const headers = readWorkflowHeaders(request.headers);
  const path = new URL(request.url).pathname;
  const verification = verifyWorkflowRequest({
    body: rawBody,
    headers,
    method: request.method,
    path,
    secrets: [env.WORKFLOW_HMAC_SECRET, env.WORKFLOW_HMAC_PREVIOUS_SECRET].filter(
      (secret): secret is string => Boolean(secret),
    ),
    toleranceSeconds: env.WORKFLOW_SIGNATURE_TOLERANCE_SECONDS,
  });

  if (!verification.ok) {
    throw new WorkflowAuthError("Workflow signature is invalid.", 401, verification.reason);
  }

  try {
    await enforceInternalApiRateLimit({
      request,
      workflowName: headers["x-workflow-name"],
    });
  } catch (error) {
    if (error instanceof ApiRateLimitError) {
      throw new WorkflowAuthError(error.message, error.status, error.code);
    }
    throw new WorkflowAuthError(
      "Request limiting is temporarily unavailable.",
      503,
      "rate_limit_unavailable",
    );
  }

  const supabase = createSupabaseServiceClient();
  const expiresAt = new Date(
    (verification.timestampSeconds + env.WORKFLOW_SIGNATURE_TOLERANCE_SECONDS) * 1000,
  ).toISOString();
  const { data: consumed, error } = await supabase.rpc("consume_workflow_nonce", {
    requested_digest: verification.bodyDigest,
    requested_expires_at: expiresAt,
    requested_nonce: headers["x-workflow-nonce"],
    requested_workflow_name: headers["x-workflow-name"],
  });

  if (error) {
    throw new WorkflowAuthError(
      "Workflow replay protection is unavailable.",
      503,
      "nonce_store_unavailable",
    );
  }
  if (!consumed) {
    throw new WorkflowAuthError("Workflow request was already consumed.", 409, "replayed_nonce");
  }

  return {
    bodyDigest: verification.bodyDigest,
    nonce: headers["x-workflow-nonce"],
    workflowName: headers["x-workflow-name"],
  };
}
