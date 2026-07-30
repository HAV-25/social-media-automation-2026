import {
  operationsErrorCategorySchema,
  type OperationsErrorCategory,
} from "@content-engine/contracts";
import { z } from "zod";

const providerErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().trim().min(1).max(120).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export function retryDelaySeconds(attemptCount: number) {
  const parsed = z.number().int().min(0).max(3).parse(attemptCount);
  return Math.min(900, 60 * 2 ** parsed);
}

export function automaticRecoveryAllowed(category: OperationsErrorCategory, retryable: boolean) {
  return retryable && ["transient", "provider"].includes(category);
}

export function replayRequiresSynchronousCompletion(status: number) {
  return z.number().int().min(100).max(599).parse(status) !== 202;
}

export function safeWorkflowFailure(status: number, raw: unknown) {
  const parsed = providerErrorSchema.safeParse(raw);
  const rawCode = parsed.success ? parsed.data.error?.code : undefined;
  const code = (rawCode ?? `upstream_http_${status}`)
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]/g, "_")
    .slice(0, 120);
  const retryable = status === 408 || status === 429 || status >= 500;
  const category: OperationsErrorCategory =
    status === 401 || status === 403
      ? "security"
      : status === 409 || status === 422
        ? "validation"
        : status === 429 || status >= 500
          ? "provider"
          : retryable
            ? "transient"
            : "permanent";
  return {
    category: operationsErrorCategorySchema.parse(category),
    code,
    retryable,
  };
}
