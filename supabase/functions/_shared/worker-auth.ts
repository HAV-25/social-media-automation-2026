const encoder = new TextEncoder();

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return mismatch === 0;
}

export function requireWorkerSecret(request: Request): void {
  const expected = Deno.env.get("LIGHTWEIGHT_WORKER_SECRET") ?? "";
  const received = request.headers.get("x-lightweight-worker-secret") ?? "";
  if (expected.length < 32 || !constantTimeEqual(expected, received)) {
    throw new WorkerHttpError(401, "worker_authentication_failed", "Worker authentication failed.");
  }
}

export class WorkerHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export function safeErrorResponse(error: unknown): Response {
  if (error instanceof WorkerHttpError) {
    return jsonResponse({ error: { code: error.code, message: error.message } }, error.status);
  }
  return jsonResponse(
    { error: { code: "lightweight_worker_failed", message: "The worker request failed safely." } },
    500,
  );
}
