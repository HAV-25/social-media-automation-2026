import { describe, expect, it } from "vitest";
import {
  classifyOperationsError,
  decodeOperationsCursor,
  encodeOperationsCursor,
  normalizeOperationsRun,
  safeParseOperationsRun,
  type RawOperationsRun,
} from "./operations-core";

const baseRun: RawOperationsRun = {
  id: "81000000-0000-4000-8000-000000000001",
  brand_id: "20000000-0000-4000-8000-000000000001",
  run_type: "research",
  entity_type: "opportunity",
  entity_id: "82000000-0000-4000-8000-000000000001",
  workflow_name: "WF-05 Research",
  workflow_execution_id: "execution-81",
  correlation_id: "83000000-0000-4000-8000-000000000001",
  idempotency_key: "operations-test-idempotency-0001",
  attempt: 2,
  status: "running",
  started_at: "2026-07-24T10:00:00.000Z",
  completed_at: null,
  model_usage: {
    model: "fake-research-v1",
    promptVersion: "evidence-synthesizer-v1",
    usage: { inputTokens: 1380, outputTokens: 720 },
    estimatedCostUsd: 0.0042,
  },
  error: null,
  created_at: "2026-07-24T10:00:00.000Z",
};

describe("operations observability core", () => {
  it("classifies failures without exposing raw provider text or credentials", () => {
    const unsafeRawError = {
      code: "provider_timeout",
      message: "Bearer sk-secret-value and raw upstream response",
      retryable: true,
    };
    const safe = classifyOperationsError(unsafeRawError);

    expect(safe).toEqual({
      category: "provider",
      code: "provider_timeout",
      retryable: true,
      message: "An external model or image provider could not complete this run.",
    });
    expect(JSON.stringify(safe)).not.toContain("sk-secret-value");
    expect(JSON.stringify(safe)).not.toContain("raw upstream response");
  });

  it("recognizes security, budget, validation, and transient categories deterministically", () => {
    expect(classifyOperationsError({ code: "unsafe_source" })?.category).toBe("security");
    expect(classifyOperationsError({ code: "budget_exceeded" })?.category).toBe("budget");
    expect(classifyOperationsError({ code: "invalid_output" })?.category).toBe("validation");
    expect(classifyOperationsError({ code: "network_timeout", retryable: true })?.category).toBe(
      "transient",
    );
  });

  it("derives stalled state, elapsed duration, usage, and cost from bounded fields", () => {
    const normalized = normalizeOperationsRun(baseRun, {
      now: new Date("2026-07-24T10:16:00.000Z"),
      stalledAfterMs: 15 * 60_000,
      latestStage: "provider.requested",
    });

    expect(normalized.isStalled).toBe(true);
    expect(normalized.durationMs).toBe(16 * 60_000);
    expect(normalized.latestStage).toBe("provider.requested");
    expect(normalized.inputTokens).toBe(1380);
    expect(normalized.outputTokens).toBe(720);
    expect(normalized.costUsd).toBe(0.0042);
  });

  it("accepts Supabase timestamp offsets in live operations rows", () => {
    const normalized = normalizeOperationsRun(
      {
        ...baseRun,
        started_at: "2026-07-24T10:00:00.000+00:00",
        created_at: "2026-07-24T10:00:00.000+00:00",
      },
      { now: new Date("2026-07-24T10:01:00.000Z") },
    );

    expect(normalized.durationMs).toBe(60_000);
  });

  it("accepts a queued RSS opportunity reservation and safely rejects malformed history", () => {
    const reservation = {
      ...baseRun,
      run_type: "rss_opportunity_reservation",
      workflow_name: "WF-04 Cluster and Score",
      workflow_execution_id: null,
      status: "queued" as const,
      started_at: null,
      model_usage: {
        rssFeedId: "415298d4-0deb-43d7-95d0-26955d40bf44",
        opportunityScore: 73.19,
        sourceDocumentId: "6ce1a59a-4117-4af6-8b21-4440c22ddc7a",
      },
      created_at: "2026-07-25T17:34:37.526566+00:00",
    };

    expect(safeParseOperationsRun(reservation)?.status).toBe("queued");
    expect(safeParseOperationsRun({ ...reservation, entity_id: null })).toBeNull();
  });

  it("round-trips signed-shape cursor data and rejects malformed cursors", () => {
    const cursor = encodeOperationsCursor({
      createdAt: "2026-07-24T10:00:00.000Z",
      id: "81000000-0000-4000-8000-000000000001",
    });

    expect(decodeOperationsCursor(cursor)).toEqual({
      createdAt: "2026-07-24T10:00:00.000Z",
      id: "81000000-0000-4000-8000-000000000001",
    });
    expect(() => decodeOperationsCursor("not-a-valid-cursor")).toThrow(
      "The operations cursor is invalid.",
    );
  });

  it("creates pagination cursors from Supabase timestamp offsets", () => {
    const createdAt = "2026-07-25T19:12:08.162978+00:00";
    const cursor = encodeOperationsCursor({
      createdAt,
      id: "81000000-0000-4000-8000-000000000001",
    });

    expect(decodeOperationsCursor(cursor).createdAt).toBe(createdAt);
  });
});
