import {
  operationsErrorCategorySchema,
  operationsRunStatusSchema,
  type OperationsErrorCategory,
  type OperationsRunStatus,
} from "@content-engine/contracts";
import { z } from "zod";

const cursorPayloadSchema = z
  .object({
    createdAt: z.iso.datetime({ offset: true }),
    id: z.uuid(),
  })
  .strict();

const rawErrorSchema = z
  .object({
    code: z.string().trim().min(1).max(120).optional(),
    category: operationsErrorCategorySchema.optional(),
    retryable: z.boolean().optional(),
  })
  .passthrough();

const modelUsageSchema = z
  .object({
    model: z.string().trim().min(1).max(200).optional(),
    promptVersion: z.string().trim().min(1).max(200).optional(),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative().optional(),
        outputTokens: z.number().int().nonnegative().optional(),
      })
      .passthrough()
      .optional(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    costUsd: z.number().nonnegative().max(100_000).optional(),
    estimatedCostUsd: z.number().nonnegative().max(100_000).optional(),
    reservedCostUsd: z.number().nonnegative().max(100_000).optional(),
  })
  .passthrough();

const rawRunSchema = z
  .object({
    id: z.uuid(),
    brand_id: z.uuid().nullable(),
    run_type: z.string().trim().min(1).max(100),
    entity_type: z.string().trim().min(1).max(100),
    entity_id: z.uuid(),
    workflow_name: z.string().trim().min(1).max(200),
    workflow_execution_id: z.string().trim().max(500).nullable(),
    correlation_id: z.uuid(),
    idempotency_key: z.string().trim().min(1).max(200),
    attempt: z.number().int().positive(),
    status: operationsRunStatusSchema,
    started_at: z.iso.datetime({ offset: true }).nullable(),
    completed_at: z.iso.datetime({ offset: true }).nullable(),
    model_usage: z.unknown(),
    error: z.unknown(),
    created_at: z.iso.datetime({ offset: true }),
  })
  .strict();

export type RawOperationsRun = z.input<typeof rawRunSchema>;

export function safeParseOperationsRun(raw: unknown): RawOperationsRun | null {
  const parsed = rawRunSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type SafeOperationsError = {
  category: OperationsErrorCategory;
  code: string;
  retryable: boolean;
  message: string;
};

export type SafeRunRecovery = {
  id: string;
  status:
    | "registered"
    | "scheduled"
    | "dispatching"
    | "retrying"
    | "completed"
    | "recovered"
    | "dead_letter"
    | "cancelled";
  category: OperationsErrorCategory | null;
  errorCode: string | null;
  retryable: boolean;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  manualRequested: boolean;
};

const categoryMessages: Record<OperationsErrorCategory, string> = {
  transient: "A temporary dependency or network condition interrupted this run.",
  permanent: "The run stopped on a non-retriable condition.",
  validation: "The input or generated output did not pass a required validation gate.",
  security: "A security or authorization control rejected this run.",
  budget: "A configured cost or usage limit prevented this run.",
  provider: "An external model or image provider could not complete this run.",
  unknown: "The run stopped with a safely redacted unclassified error.",
};

export function classifyOperationsError(raw: unknown): SafeOperationsError | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = rawErrorSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      category: "unknown",
      code: "unclassified_error",
      retryable: false,
      message: categoryMessages.unknown,
    };
  }
  const normalizedCode = (parsed.data.code ?? "unclassified_error")
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]/g, "_")
    .slice(0, 120);
  const inferred: OperationsErrorCategory =
    parsed.data.category ??
    (/signature|replay|nonce|auth|permission|forbidden|security|ssrf|unsafe/.test(normalizedCode)
      ? "security"
      : /budget|cost|quota|allowance/.test(normalizedCode)
        ? "budget"
        : /provider|openai|model|image_|rate_limit/.test(normalizedCode)
          ? "provider"
          : /invalid|validation|schema|malformed|unsupported|empty_|evidence/.test(normalizedCode)
            ? "validation"
            : parsed.data.retryable ||
                /timeout|network|unavailable|connection|temporary/.test(normalizedCode)
              ? "transient"
              : "permanent");
  return {
    category: inferred,
    code: normalizedCode || "unclassified_error",
    retryable: parsed.data.retryable ?? false,
    message: categoryMessages[inferred],
  };
}

export function encodeOperationsCursor(input: { createdAt: string; id: string }) {
  const payload = cursorPayloadSchema.parse(input);
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeOperationsCursor(cursor: string) {
  if (cursor.length > 500) throw new Error("The operations cursor is invalid.");
  try {
    return cursorPayloadSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw new Error("The operations cursor is invalid.");
  }
}

export function normalizeOperationsRun(
  raw: RawOperationsRun,
  options: {
    latestStage?: string;
    now?: Date;
    recovery?: SafeRunRecovery | null;
    stalledAfterMs?: number;
  } = {},
) {
  const run = rawRunSchema.parse(raw);
  const now = options.now ?? new Date();
  const stalledAfterMs = options.stalledAfterMs ?? 15 * 60_000;
  const startedAt = run.started_at ? new Date(run.started_at) : null;
  const completedAt = run.completed_at ? new Date(run.completed_at) : null;
  const durationEnd = completedAt ?? (run.status === "running" ? now : null);
  const durationMs =
    startedAt && durationEnd ? Math.max(0, durationEnd.getTime() - startedAt.getTime()) : null;
  const isStalled =
    run.status === "running" &&
    startedAt !== null &&
    now.getTime() - startedAt.getTime() >= stalledAfterMs;
  const usage = modelUsageSchema.safeParse(run.model_usage);
  const safeUsage = usage.success ? usage.data : {};
  const inputTokens = safeUsage.usage?.inputTokens ?? safeUsage.inputTokens ?? 0;
  const outputTokens = safeUsage.usage?.outputTokens ?? safeUsage.outputTokens ?? 0;
  const costUsd = safeUsage.costUsd ?? safeUsage.estimatedCostUsd ?? safeUsage.reservedCostUsd ?? 0;

  return {
    id: run.id,
    brandId: run.brand_id,
    runType: run.run_type,
    entityType: run.entity_type,
    entityId: run.entity_id,
    workflowName: run.workflow_name,
    workflowExecutionId: run.workflow_execution_id,
    correlationId: run.correlation_id,
    attempt: run.attempt,
    status: run.status as OperationsRunStatus,
    latestStage: options.latestStage ?? "Run recorded",
    startedAt: run.started_at,
    completedAt: run.completed_at,
    createdAt: run.created_at,
    durationMs,
    isStalled,
    model: safeUsage.model ?? null,
    promptVersion: safeUsage.promptVersion ?? null,
    inputTokens,
    outputTokens,
    costUsd,
    error: classifyOperationsError(run.error),
    recovery: options.recovery ?? null,
  };
}
