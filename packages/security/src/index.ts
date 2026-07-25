import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const workflowHeadersSchema = z.object({
  "x-workflow-name": z.string().min(1).max(120),
  "x-workflow-nonce": z.uuid(),
  "x-workflow-signature": z.string().regex(/^sha256=[0-9a-f]{64}$/),
  "x-workflow-timestamp": z.string().regex(/^\d{10}$/),
});

export type WorkflowHeaders = z.infer<typeof workflowHeadersSchema>;

export type WorkflowSignatureInput = {
  body: string;
  method: string;
  nonce: string;
  path: string;
  timestamp: string;
};

export function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function workflowCanonicalRequest(input: WorkflowSignatureInput) {
  return [
    input.timestamp,
    input.nonce,
    input.method.toUpperCase(),
    input.path,
    sha256Hex(input.body),
  ].join("\n");
}

export function signWorkflowRequest(input: WorkflowSignatureInput, secret: string) {
  const digest = createHmac("sha256", secret)
    .update(workflowCanonicalRequest(input), "utf8")
    .digest("hex");
  return `sha256=${digest}`;
}

export function verifyWorkflowRequest({
  body,
  headers,
  method,
  now = Date.now(),
  path,
  secret,
  secrets,
  toleranceSeconds = 300,
}: {
  body: string;
  headers: WorkflowHeaders;
  method: string;
  now?: number;
  path: string;
  secret?: string;
  secrets?: readonly string[];
  toleranceSeconds?: number;
}) {
  const timestampSeconds = Number(headers["x-workflow-timestamp"]);
  const ageSeconds = Math.abs(Math.floor(now / 1000) - timestampSeconds);
  if (!Number.isSafeInteger(timestampSeconds) || ageSeconds > toleranceSeconds) {
    return { ok: false as const, reason: "timestamp_outside_tolerance" as const };
  }

  const received = headers["x-workflow-signature"];
  const receivedBuffer = Buffer.from(received, "utf8");
  const candidates = [
    ...new Set((secrets?.length ? secrets : secret ? [secret] : []).filter(Boolean)),
  ];
  let authenticated = false;
  for (const candidate of candidates) {
    const expected = signWorkflowRequest(
      {
        body,
        method,
        nonce: headers["x-workflow-nonce"],
        path,
        timestamp: headers["x-workflow-timestamp"],
      },
      candidate,
    );
    const expectedBuffer = Buffer.from(expected, "utf8");
    const matches =
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer);
    authenticated = authenticated || matches;
  }
  if (!authenticated) {
    return { ok: false as const, reason: "invalid_signature" as const };
  }

  return {
    bodyDigest: sha256Hex(body),
    ok: true as const,
    timestampSeconds,
  };
}

const sensitiveFieldName =
  /(?:authorization|cookie|password|passwd|secret|token|api[_-]?key|source[_-]?(?:text|content)|raw[_-]?(?:body|content)|prompt|provider[_-]?response)/i;

export function redactSensitiveText(value: string, maxLength = 1_000) {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+@/gi, "$1[redacted]@")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted-api-key]")
    .replace(
      /\b((?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|secret)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[redacted]",
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-jwt]")
    .replace(/\p{Cc}/gu, (character) => (["\n", "\r", "\t"].includes(character) ? character : ""))
    .slice(0, Math.max(1, Math.min(maxLength, 10_000)));
}

export function sanitizeLogMetadata(
  value: unknown,
  options: { depth?: number; maxArrayItems?: number; maxStringLength?: number } = {},
): unknown {
  const depth = options.depth ?? 0;
  const maxArrayItems = options.maxArrayItems ?? 20;
  const maxStringLength = options.maxStringLength ?? 500;
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") return redactSensitiveText(value, maxStringLength);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, maxArrayItems)
      .map((item) =>
        sanitizeLogMetadata(item, { depth: depth + 1, maxArrayItems, maxStringLength }),
      );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([key, entry]) => [
          key,
          sensitiveFieldName.test(key)
            ? "[redacted]"
            : sanitizeLogMetadata(entry, {
                depth: depth + 1,
                maxArrayItems,
                maxStringLength,
              }),
        ]),
    );
  }
  return String(value).slice(0, maxStringLength);
}
