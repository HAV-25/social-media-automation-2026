import "server-only";
import { serverEnvSchema } from "@content-engine/contracts";
import { sanitizeLogMetadata, sha256Hex } from "@content-engine/security";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "./supabase/service";

const rateLimitResultSchema = z
  .object({
    allowed: z.boolean(),
    limit: z.number().int().positive(),
    remaining: z.number().int().nonnegative(),
    resetAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type ApiRateLimitResult = z.infer<typeof rateLimitResultSchema>;
type RateLimitScope = "user" | "internal";

const demoCounters = new Map<string, { count: number; resetAt: number }>();
const uuidPathSegment =
  /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi;

export class ApiRateLimitError extends Error {
  constructor(
    readonly code: "api_rate_limited" | "rate_limit_unavailable",
    readonly status: 429 | 503,
    readonly retryAfterSeconds?: number,
  ) {
    super(
      code === "api_rate_limited"
        ? "Too many requests. Try again after the current limit window."
        : "Request limiting is temporarily unavailable.",
    );
  }
}

export function normalizedApiOperation(request: Pick<Request, "method" | "url">) {
  const path = new URL(request.url).pathname.toLowerCase().replace(uuidPathSegment, "/:id");
  return `${request.method.toLowerCase()}:${path}`.slice(0, 180);
}

function retryAfterSeconds(resetAt: string) {
  return Math.max(1, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 1_000));
}

function consumeDemoRateLimit(input: {
  scope: RateLimitScope;
  subjectHash: string;
  operation: string;
  limit: number;
  windowSeconds: number;
}): ApiRateLimitResult {
  const now = Date.now();
  const windowMilliseconds = input.windowSeconds * 1_000;
  const resetAt = Math.floor(now / windowMilliseconds) * windowMilliseconds + windowMilliseconds;
  const key = `${input.scope}:${input.subjectHash}:${input.operation}:${resetAt}`;
  const existing = demoCounters.get(key);
  const count = existing ? existing.count + 1 : 1;
  demoCounters.set(key, { count, resetAt });
  if (demoCounters.size > 1_000) {
    for (const [counterKey, counter] of demoCounters) {
      if (counter.resetAt <= now) demoCounters.delete(counterKey);
    }
  }
  return {
    allowed: count <= input.limit,
    limit: input.limit,
    remaining: Math.max(input.limit - count, 0),
    resetAt: new Date(resetAt).toISOString(),
  };
}

export async function consumeApiRateLimit(input: {
  scope: RateLimitScope;
  subject: string;
  operation: string;
}): Promise<ApiRateLimitResult> {
  const env = serverEnvSchema.parse(process.env);
  const limit =
    input.scope === "user"
      ? env.USER_API_RATE_LIMIT_REQUESTS
      : env.INTERNAL_API_RATE_LIMIT_REQUESTS;
  const windowSeconds =
    input.scope === "user"
      ? env.USER_API_RATE_LIMIT_WINDOW_SECONDS
      : env.INTERNAL_API_RATE_LIMIT_WINDOW_SECONDS;
  const subjectHash = sha256Hex(`${input.scope}:${input.subject}`);
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    return consumeDemoRateLimit({
      scope: input.scope,
      subjectHash,
      operation: input.operation,
      limit,
      windowSeconds,
    });
  }
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("consume_api_rate_limit", {
    requested_scope: input.scope,
    requested_subject_hash: subjectHash,
    requested_operation: input.operation,
    requested_limit: limit,
    requested_window_seconds: windowSeconds,
  });
  if (error) {
    console.error(
      "Supabase API rate-limit dependency failed.",
      sanitizeLogMetadata({
        code: error.code,
        message: error.message,
      }),
    );
    throw new ApiRateLimitError("rate_limit_unavailable", 503);
  }
  return rateLimitResultSchema.parse(data);
}

export async function enforceInternalApiRateLimit(input: {
  request: Request;
  workflowName: string;
}) {
  const result = await consumeApiRateLimit({
    scope: "internal",
    subject: input.workflowName,
    operation: normalizedApiOperation(input.request),
  });
  if (!result.allowed) {
    throw new ApiRateLimitError("api_rate_limited", 429, retryAfterSeconds(result.resetAt));
  }
  return result;
}

export async function enforceUserApiRateLimit(input: {
  request: Pick<Request, "method" | "url">;
  userId: string;
}) {
  try {
    const result = await consumeApiRateLimit({
      scope: "user",
      subject: input.userId,
      operation: normalizedApiOperation(input.request),
    });
    if (result.allowed) return null;
    const retryAfter = retryAfterSeconds(result.resetAt);
    return NextResponse.json(
      {
        error: {
          code: "api_rate_limited",
          message: "Too many requests. Try again after the current limit window.",
        },
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  } catch (error) {
    if (error instanceof ApiRateLimitError && error.status === 429) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        {
          status: error.status,
          headers: error.retryAfterSeconds
            ? { "Retry-After": String(error.retryAfterSeconds) }
            : undefined,
        },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "rate_limit_unavailable",
          message: "Request limiting is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
