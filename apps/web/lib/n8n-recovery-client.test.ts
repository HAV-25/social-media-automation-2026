import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildRecoveryReplayIdempotencyKey,
  N8nRecoveryClient,
  N8nRecoveryError,
} from "./n8n-recovery-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("n8n recovery client", () => {
  it("replays the typed workflow from its webhook with a fresh signature", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new N8nRecoveryClient({
      webhookBaseUrl: "https://n8n.example.test/",
      hmacSecret: "test-recovery-secret-with-32-bytes",
    });

    await expect(
      client.replayWorkflow("research", {
        contractVersion: "1.0",
        correlationId: "10000000-0000-4000-8000-000000000001",
        idempotencyKey: "recovery-research-request-0001",
        actorId: "10000000-0000-4000-8000-000000000002",
        brandId: "10000000-0000-4000-8000-000000000003",
        opportunityId: "10000000-0000-4000-8000-000000000004",
        requestedAt: "2026-07-28T15:45:00.000Z",
      }),
    ).resolves.toEqual({ accepted: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://n8n.example.test/webhook/research-v1",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-workflow-name": "WF-10 Error and Recovery",
          "x-workflow-signature": expect.stringMatching(/^sha256=/),
        }),
      }),
    );
  });

  it("gives each bounded recovery attempt a deterministic fresh idempotency key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new N8nRecoveryClient({
      webhookBaseUrl: "https://n8n.example.test",
      hmacSecret: "test-recovery-secret-with-32-bytes",
    });
    const identity = {
      recoveryId: "10000000-0000-4000-8000-000000000005",
      attemptCount: 2,
    };

    await client.replayWorkflow(
      "research",
      {
        contractVersion: "1.0",
        correlationId: "10000000-0000-4000-8000-000000000001",
        idempotencyKey: "original-research-request-0001",
        actorId: "10000000-0000-4000-8000-000000000002",
        brandId: "10000000-0000-4000-8000-000000000003",
        opportunityId: "10000000-0000-4000-8000-000000000004",
        requestedAt: "2026-07-28T15:45:00.000Z",
      },
      identity,
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      idempotencyKey: buildRecoveryReplayIdempotencyKey(identity),
      correlationId: "10000000-0000-4000-8000-000000000001",
    });
  });

  it("rejects an invalid typed replay before contacting n8n", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new N8nRecoveryClient({
      webhookBaseUrl: "https://n8n.example.test",
      hmacSecret: "test-recovery-secret-with-32-bytes",
    });

    await expect(client.replayWorkflow("research", {})).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when credentials are absent or n8n rejects the replay", async () => {
    expect(() => new N8nRecoveryClient({ webhookBaseUrl: "", hmacSecret: "" })).toThrowError(
      N8nRecoveryError,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: true }), { status: 401 })),
    );
    const client = new N8nRecoveryClient({
      webhookBaseUrl: "https://n8n.example.test",
      hmacSecret: "test-recovery-secret-with-32-bytes",
    });
    await expect(
      client.replayWorkflow("research", {
        contractVersion: "1.0",
        correlationId: "10000000-0000-4000-8000-000000000001",
        idempotencyKey: "recovery-research-request-0002",
        actorId: "10000000-0000-4000-8000-000000000002",
        brandId: "10000000-0000-4000-8000-000000000003",
        opportunityId: "10000000-0000-4000-8000-000000000004",
        requestedAt: "2026-07-28T15:45:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "n8n_replay_rejected" });
  });
});
