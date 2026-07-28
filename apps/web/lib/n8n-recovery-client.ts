import "server-only";
import {
  serverEnvSchema,
  workflowRecoveryExecutionSchema,
  type RecoveryTarget,
} from "@content-engine/contracts";
import { randomUUID } from "node:crypto";
import { signWorkflowRequest } from "@content-engine/security";

export class N8nRecoveryError extends Error {
  constructor(readonly code: "n8n_recovery_unavailable" | "n8n_replay_rejected") {
    super("The n8n recovery operation could not be completed.");
  }
}

const replayConfiguration = {
  research: {
    path: "/webhook/research-v1",
    workflowName: "WF-05 Research",
  },
  editorial_generation: {
    path: "/webhook/editorial-generation-v1",
    workflowName: "WF-06 Angle and Post Generation",
  },
  post_verification: {
    path: "/webhook/post-verification-v1",
    workflowName: "WF-07 Post Verification",
  },
  image_generation: {
    path: "/webhook/image-generation-v1",
    workflowName: "WF-08 Image Generation",
  },
  content_action: {
    path: "/webhook/content-actions-v1",
    workflowName: "WF-09 Content Actions",
  },
} as const satisfies Record<RecoveryTarget, { path: string; workflowName: string }>;

export class N8nRecoveryClient {
  private readonly webhookBaseUrl: string;
  private readonly hmacSecret: string;

  constructor(configuration?: { webhookBaseUrl: string; hmacSecret: string }) {
    const env = configuration ?? serverEnvSchema.parse(process.env);
    const webhookBaseUrl = "webhookBaseUrl" in env ? env.webhookBaseUrl : env.N8N_WEBHOOK_BASE_URL;
    const hmacSecret = "hmacSecret" in env ? env.hmacSecret : env.WORKFLOW_HMAC_SECRET;
    if (!webhookBaseUrl || !hmacSecret) {
      throw new N8nRecoveryError("n8n_recovery_unavailable");
    }
    this.webhookBaseUrl = webhookBaseUrl.replace(/\/+$/, "");
    this.hmacSecret = hmacSecret;
  }

  async replayWorkflow(target: RecoveryTarget, rawPayload: unknown) {
    const configuration = replayConfiguration[target];
    const parsed = workflowRecoveryExecutionSchema.parse({
      contractVersion: "1.0",
      workflowExecutionId: "fresh-recovery-replay",
      workflowName: configuration.workflowName,
      target,
      requestPayload: rawPayload,
    });
    const body = JSON.stringify(parsed.requestPayload);
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const nonce = randomUUID();
    const response = await fetch(`${this.webhookBaseUrl}${configuration.path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-workflow-name": "WF-10 Error and Recovery",
        "x-workflow-nonce": nonce,
        "x-workflow-timestamp": timestamp,
        "x-workflow-signature": signWorkflowRequest(
          {
            body,
            method: "POST",
            nonce,
            path: configuration.path,
            timestamp,
          },
          this.hmacSecret,
        ),
      },
      body,
      signal: AbortSignal.timeout(180_000),
      cache: "no-store",
    });
    if (!response.ok) throw new N8nRecoveryError("n8n_replay_rejected");
    return { accepted: true as const, status: response.status };
  }
}
