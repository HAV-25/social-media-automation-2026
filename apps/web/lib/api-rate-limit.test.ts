import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { consumeApiRateLimit, normalizedApiOperation } from "./api-rate-limit";

describe("API rate limiting", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    process.env.USER_API_RATE_LIMIT_REQUESTS = "2";
    process.env.USER_API_RATE_LIMIT_WINDOW_SECONDS = "60";
  });

  it("normalizes resource UUIDs so changing IDs cannot evade an endpoint limit", () => {
    expect(
      normalizedApiOperation({
        method: "POST",
        url: "https://app.test/api/posts/90000000-0000-4000-8000-000000000001/images",
      }),
    ).toBe("post:/api/posts/:id/images");
  });

  it("allows the configured fixed-window capacity and denies the next request", async () => {
    const subject = crypto.randomUUID();
    const input = {
      scope: "user" as const,
      subject,
      operation: "post:/api/inputs",
    };

    await expect(consumeApiRateLimit(input)).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
    });
    await expect(consumeApiRateLimit(input)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
    await expect(consumeApiRateLimit(input)).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
    });
  });
});
