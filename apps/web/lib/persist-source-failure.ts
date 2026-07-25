import { sourceAdapterFailureResultSchema, type SourceType } from "@content-engine/contracts";
import { sha256Hex } from "@content-engine/security";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "./supabase/service";

const failureRpcRowSchema = z.object({
  source_document_id: z.uuid(),
  generation_run_id: z.uuid(),
  duplicate: z.boolean(),
});

export async function persistSourceFailure(input: {
  actorId: string;
  brandId: string;
  idempotencyKey: string;
  sourceType: Exclude<SourceType, "rss">;
  title: string;
  failure: z.infer<typeof sourceAdapterFailureResultSchema>;
  canonicalUrl?: string;
  storagePath?: string;
  rawSha256?: string;
}) {
  const status = input.failure.code === "too_large" ? 413 : input.failure.retryable ? 502 : 422;
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    return NextResponse.json(
      sourceAdapterFailureResultSchema.parse({
        ...input.failure,
        storagePath: input.storagePath,
      }),
      { status },
    );
  }
  const requestHash = sha256Hex(
    JSON.stringify({
      brandId: input.brandId,
      sourceType: input.sourceType,
      title: input.title,
      canonicalUrl: input.canonicalUrl,
      storagePath: input.storagePath,
      rawSha256: input.rawSha256,
      code: input.failure.code,
    }),
  );
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .rpc("record_source_failure", {
      payload: {
        contractVersion: "1.0",
        actorId: input.actorId,
        brandId: input.brandId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        sourceType: input.sourceType,
        title: input.title,
        canonicalUrl: input.canonicalUrl,
        storagePath: input.storagePath,
        rawSha256: input.rawSha256,
        failureCode: input.failure.code,
        failureMessage: input.failure.message,
        retryable: input.failure.retryable,
      },
    })
    .single();
  if (error) {
    return NextResponse.json(
      {
        error: {
          code: error.code === "23505" ? "idempotency_conflict" : "failure_persistence_failed",
          message:
            error.code === "23505"
              ? "This idempotency key was already used for another request."
              : "The extraction failure could not be recorded.",
        },
      },
      { status: error.code === "23505" ? 409 : 500 },
    );
  }
  const row = failureRpcRowSchema.parse(data);
  return NextResponse.json(
    sourceAdapterFailureResultSchema.parse({
      ...input.failure,
      sourceDocumentId: row.source_document_id,
      generationRunId: row.generation_run_id,
      storagePath: input.storagePath,
    }),
    { status },
  );
}
