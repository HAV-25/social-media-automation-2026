import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { N8nRecoveryClient, N8nRecoveryError } from "./n8n-recovery-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("n8n recovery client", () => {
  it("retries the exact encoded execution with the server API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 4321 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new N8nRecoveryClient({
      apiUrl: "https://n8n.example.test/",
      apiKey: "server-key",
    });

    await expect(client.retryExecution("exec/id")).resolves.toBe("4321");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://n8n.example.test/api/v1/executions/exec%2Fid/retry",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-N8N-API-KEY": "server-key" }),
      }),
    );
  });

  it("tolerates already-stopped executions but classifies other stop failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 409 }))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new N8nRecoveryClient({
      apiUrl: "https://n8n.example.test",
      apiKey: "server-key",
    });

    await expect(client.stopExecution("already-stopped")).resolves.toBeUndefined();
    await expect(client.stopExecution("failed-stop")).rejects.toMatchObject({
      code: "n8n_stop_failed",
    });
  });

  it("fails closed when recovery credentials are absent or retry output is invalid", async () => {
    expect(() => new N8nRecoveryClient({ apiUrl: "", apiKey: "" })).toThrowError(N8nRecoveryError);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ unexpected: true }), { status: 200 })),
    );
    const client = new N8nRecoveryClient({
      apiUrl: "https://n8n.example.test",
      apiKey: "server-key",
    });
    await expect(client.retryExecution("execution")).rejects.toThrow();
  });
});
