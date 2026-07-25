import "server-only";
import { serverEnvSchema } from "@content-engine/contracts";
import { z } from "zod";

const retryResponseSchema = z.object({
  id: z.union([z.string().min(1).max(200), z.number().int().nonnegative()]).transform(String),
});

export class N8nRecoveryError extends Error {
  constructor(readonly code: "n8n_recovery_unavailable" | "n8n_stop_failed" | "n8n_retry_failed") {
    super("The n8n recovery operation could not be completed.");
  }
}

export class N8nRecoveryClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(configuration?: { apiUrl: string; apiKey: string }) {
    const env = configuration ?? serverEnvSchema.parse(process.env);
    const apiUrl = "apiUrl" in env ? env.apiUrl : env.N8N_API_URL;
    const apiKey = "apiKey" in env ? env.apiKey : env.N8N_API_KEY;
    if (!apiUrl || !apiKey) throw new N8nRecoveryError("n8n_recovery_unavailable");
    this.apiUrl = apiUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  private async request(path: string, method: "POST") {
    const response = await fetch(`${this.apiUrl}/api/v1${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "X-N8N-API-KEY": this.apiKey,
      },
      body: "{}",
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    return { body, ok: response.ok, status: response.status };
  }

  async stopExecution(executionId: string) {
    const response = await this.request(
      `/executions/${encodeURIComponent(executionId)}/stop`,
      "POST",
    );
    if (!response.ok && ![404, 409].includes(response.status)) {
      throw new N8nRecoveryError("n8n_stop_failed");
    }
  }

  async retryExecution(executionId: string) {
    const response = await this.request(
      `/executions/${encodeURIComponent(executionId)}/retry`,
      "POST",
    );
    if (!response.ok) throw new N8nRecoveryError("n8n_retry_failed");
    return retryResponseSchema.parse(response.body).id;
  }
}
