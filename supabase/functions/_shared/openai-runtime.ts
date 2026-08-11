import { WorkerHttpError } from "./worker-auth.ts";

const OPENAI_TIMEOUT_MS = 120_000;

type JsonSchemaFormat = {
  name: string;
  schema: Record<string, unknown>;
};

type OpenAIUsage = {
  inputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
  estimatedCostUsd: number;
};

function apiKey(): string {
  const value = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!value.startsWith("sk-") || value.length < 30) {
    throw new WorkerHttpError(
      500,
      "openai_environment_missing",
      "The model provider is not configured.",
    );
  }
  return value;
}

function outputText(response: Record<string, unknown>): string {
  const direct = response.output_text;
  if (typeof direct === "string" && direct.trim()) return direct;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) return text;
    }
  }
  throw new WorkerHttpError(
    502,
    "provider_output_missing",
    "The model returned no structured output.",
  );
}

function usage(response: Record<string, unknown>, webSearchCalls: number): OpenAIUsage {
  const raw =
    response.usage && typeof response.usage === "object"
      ? (response.usage as Record<string, unknown>)
      : {};
  const inputTokens = Number(raw.input_tokens ?? 0);
  const outputTokens = Number(raw.output_tokens ?? 0);
  const inputPerMillion = Number(Deno.env.get("OPENAI_INPUT_USD_PER_MILLION") ?? 0.25);
  const outputPerMillion = Number(Deno.env.get("OPENAI_OUTPUT_USD_PER_MILLION") ?? 2);
  const searchUnit = Number(Deno.env.get("OPENAI_WEB_SEARCH_USD_PER_CALL") ?? 0.01);
  return {
    inputTokens,
    outputTokens,
    webSearchCalls,
    estimatedCostUsd:
      Math.round(
        ((inputTokens * inputPerMillion + outputTokens * outputPerMillion) / 1_000_000 +
          webSearchCalls * searchUnit) *
          1_000_000,
      ) / 1_000_000,
  };
}

export async function structuredResponse<T>(input: {
  instructions: string;
  prompt: string;
  format: JsonSchemaFormat;
  maxOutputTokens: number;
  webSearch?: boolean;
}): Promise<{ data: T; responseId: string; model: string; usage: OpenAIUsage }> {
  const model = Deno.env.get("OPENAI_TEXT_MODEL") ?? "gpt-5-mini";
  const tools = input.webSearch ? [{ type: "web_search", search_context_size: "low" }] : undefined;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${apiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: input.instructions,
      input: input.prompt,
      ...(tools ? { tools, tool_choice: "required", parallel_tool_calls: false } : {}),
      text: {
        format: {
          type: "json_schema",
          name: input.format.name,
          strict: true,
          schema: input.format.schema,
        },
      },
      max_output_tokens: input.maxOutputTokens,
      store: false,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const code = response.status === 429 ? "provider_rate_limited" : "provider_request_failed";
    throw new WorkerHttpError(
      response.status === 429 ? 503 : 502,
      code,
      "The model request failed safely.",
    );
  }
  let parsed: T;
  try {
    parsed = JSON.parse(outputText(body)) as T;
  } catch {
    throw new WorkerHttpError(
      502,
      "provider_output_invalid",
      "The model returned invalid structured output.",
    );
  }
  const calls = Array.isArray(body.output)
    ? body.output.filter(
        (item) =>
          item &&
          typeof item === "object" &&
          (item as Record<string, unknown>).type === "web_search_call",
      ).length
    : 0;
  return {
    data: parsed,
    responseId: String(body.id ?? "unknown"),
    model: String(body.model ?? model),
    usage: usage(body, calls),
  };
}

export async function generateBaseImage(prompt: string): Promise<{
  bytes: Uint8Array;
  responseId: string;
  model: string;
  costUsd: number;
}> {
  const model = Deno.env.get("OPENAI_IMAGE_MODEL") ?? "gpt-image-1-mini";
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${apiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      size: "1536x1024",
      quality: "low",
      output_format: "png",
    }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new WorkerHttpError(
      response.status === 429 ? 503 : 502,
      "image_provider_failed",
      "The image provider request failed safely.",
    );
  }
  const first = Array.isArray(body.data)
    ? (body.data[0] as Record<string, unknown> | undefined)
    : undefined;
  if (!first || typeof first.b64_json !== "string") {
    throw new WorkerHttpError(502, "image_output_missing", "The image provider returned no image.");
  }
  const binary = Uint8Array.from(atob(first.b64_json), (character) => character.charCodeAt(0));
  return {
    bytes: binary,
    responseId: String(first.revised_prompt ?? crypto.randomUUID()),
    model,
    costUsd: Number(Deno.env.get("OPENAI_IMAGE_ESTIMATED_COST_USD") ?? 0.01),
  };
}
