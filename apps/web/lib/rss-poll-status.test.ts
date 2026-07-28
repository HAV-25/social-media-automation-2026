import { describe, expect, it } from "vitest";
import { deriveRssPollStatus } from "./rss-poll-status";

describe("RSS polling status", () => {
  it("reports successful, failed, and not-yet-completed polling explicitly", () => {
    expect(
      deriveRssPollStatus({
        lastPolledAt: "2026-07-28T09:15:00.000Z",
        lastSuccessAt: "2026-07-28T09:15:00.000Z",
        lastError: null,
      }),
    ).toBe("Completed");
    expect(
      deriveRssPollStatus({
        lastPolledAt: "2026-07-28T09:15:00.000Z",
        lastSuccessAt: "2026-07-28T08:00:00.000Z",
        lastError: "rss_fetch_failed",
      }),
    ).toBe("Failed");
    expect(
      deriveRssPollStatus({
        lastPolledAt: null,
        lastSuccessAt: null,
        lastError: null,
      }),
    ).toBe("Pending");
  });
});
