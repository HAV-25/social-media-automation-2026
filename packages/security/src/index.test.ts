import { describe, expect, it } from "vitest";
import {
  redactSensitiveText,
  sanitizeLogMetadata,
  signWorkflowRequest,
  verifyWorkflowRequest,
  workflowCanonicalRequest,
  workflowHeadersSchema,
} from "./index";

const secret = "test-secret-with-at-least-thirty-two-characters";
const baseInput = {
  body: '{"feedId":"20000000-0000-4000-8000-000000000001"}',
  method: "POST",
  nonce: "90000000-0000-4000-8000-000000000001",
  path: "/api/internal/workflows/rss/intake",
  timestamp: "1784808000",
};

describe("workflow request signatures", () => {
  it("uses a stable canonical request and accepts an authentic request", () => {
    expect(workflowCanonicalRequest(baseInput).split("\n")).toHaveLength(5);
    const signature = signWorkflowRequest(baseInput, secret);
    const result = verifyWorkflowRequest({
      body: baseInput.body,
      headers: workflowHeadersSchema.parse({
        "x-workflow-name": "WF-01 RSS Intake",
        "x-workflow-nonce": baseInput.nonce,
        "x-workflow-signature": signature,
        "x-workflow-timestamp": baseInput.timestamp,
      }),
      method: baseInput.method,
      now: Number(baseInput.timestamp) * 1000,
      path: baseInput.path,
      secret,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects a changed body without leaking comparison details", () => {
    const signature = signWorkflowRequest(baseInput, secret);
    const result = verifyWorkflowRequest({
      body: '{"feedId":"tampered"}',
      headers: workflowHeadersSchema.parse({
        "x-workflow-name": "WF-01 RSS Intake",
        "x-workflow-nonce": baseInput.nonce,
        "x-workflow-signature": signature,
        "x-workflow-timestamp": baseInput.timestamp,
      }),
      method: baseInput.method,
      now: Number(baseInput.timestamp) * 1000,
      path: baseInput.path,
      secret,
    });

    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("rejects a valid but stale signature", () => {
    const signature = signWorkflowRequest(baseInput, secret);
    const result = verifyWorkflowRequest({
      body: baseInput.body,
      headers: workflowHeadersSchema.parse({
        "x-workflow-name": "WF-01 RSS Intake",
        "x-workflow-nonce": baseInput.nonce,
        "x-workflow-signature": signature,
        "x-workflow-timestamp": baseInput.timestamp,
      }),
      method: baseInput.method,
      now: (Number(baseInput.timestamp) + 301) * 1000,
      path: baseInput.path,
      secret,
    });

    expect(result).toEqual({ ok: false, reason: "timestamp_outside_tolerance" });
  });

  it("accepts the active or previous secret during a bounded rotation window", () => {
    const previousSecret = "previous-secret-with-at-least-thirty-two-characters";
    const signature = signWorkflowRequest(baseInput, previousSecret);
    const result = verifyWorkflowRequest({
      body: baseInput.body,
      headers: workflowHeadersSchema.parse({
        "x-workflow-name": "WF-01 RSS Intake",
        "x-workflow-nonce": baseInput.nonce,
        "x-workflow-signature": signature,
        "x-workflow-timestamp": baseInput.timestamp,
      }),
      method: baseInput.method,
      now: Number(baseInput.timestamp) * 1000,
      path: baseInput.path,
      secrets: [secret, previousSecret],
    });

    expect(result.ok).toBe(true);
  });
});

describe("log redaction", () => {
  it("redacts credentials and connection passwords without echoing their values", () => {
    const redacted = redactSensitiveText(
      "Authorization: Bearer abc.def.ghi api_key=sk-sensitivevalue123 password=hunter2 postgres://user:pass@db.test/app",
    );

    expect(redacted).not.toMatch(/abc\.def|sensitivevalue|hunter2|user:pass/);
    expect(redacted).toContain("[redacted]");
  });

  it("redacts hostile source, prompt, token, and response fields recursively", () => {
    const sanitized = sanitizeLogMetadata({
      event: "provider.failed",
      sourceText: "private source",
      nested: {
        prompt: "system instructions",
        access_token: "secret-token",
        safeCode: "provider_timeout",
      },
    });

    expect(sanitized).toEqual({
      event: "provider.failed",
      sourceText: "[redacted]",
      nested: {
        prompt: "[redacted]",
        access_token: "[redacted]",
        safeCode: "provider_timeout",
      },
    });
  });
});
