import { describe, expect, it } from "vitest";
import {
  automaticRecoveryAllowed,
  replayRequiresSynchronousCompletion,
  retryDelaySeconds,
  safeWorkflowFailure,
} from "./recovery-core";

describe("recovery policy", () => {
  it("uses deterministic capped exponential backoff", () => {
    expect([0, 1, 2, 3].map(retryDelaySeconds)).toEqual([60, 120, 240, 480]);
    expect(() => retryDelaySeconds(4)).toThrow();
    expect(() => retryDelaySeconds(-1)).toThrow();
  });

  it("allows automatic recovery only for retryable transient and provider failures", () => {
    expect(automaticRecoveryAllowed("transient", true)).toBe(true);
    expect(automaticRecoveryAllowed("provider", true)).toBe(true);
    expect(automaticRecoveryAllowed("security", true)).toBe(false);
    expect(automaticRecoveryAllowed("provider", false)).toBe(false);
  });

  it("lets an asynchronously accepted replay complete only when its child stage finishes", () => {
    expect(replayRequiresSynchronousCompletion(202)).toBe(false);
    expect(replayRequiresSynchronousCompletion(200)).toBe(true);
    expect(replayRequiresSynchronousCompletion(201)).toBe(true);
    expect(() => replayRequiresSynchronousCompletion(99)).toThrow();
  });

  it("keeps only a bounded error code and never leaks raw provider details", () => {
    const failure = safeWorkflowFailure(503, {
      error: {
        code: "Provider Timeout!",
        message: "Bearer sk-secret-value raw provider response",
      },
    });

    expect(failure).toEqual({
      category: "provider",
      code: "provider_timeout_",
      retryable: true,
    });
    expect(JSON.stringify(failure)).not.toContain("sk-secret-value");
    expect(safeWorkflowFailure(403, {}).category).toBe("security");
    expect(safeWorkflowFailure(422, {}).category).toBe("validation");
  });
});
