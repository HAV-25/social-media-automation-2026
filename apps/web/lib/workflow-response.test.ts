import { describe, expect, it } from "vitest";
import { workflowJsonResponse } from "./workflow-response";

describe("workflow JSON responses", () => {
  it("emits exact uncompressed response metadata for n8n", async () => {
    const payload = { contractVersion: "1.0", value: "robotics ✓" };
    const response = workflowJsonResponse(payload, { status: 202 });
    const body = JSON.stringify(payload);

    expect(response.status).toBe(202);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("content-length")).toBe(String(Buffer.byteLength(body, "utf8")));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe(body);
  });
});
