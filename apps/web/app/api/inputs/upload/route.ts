import { extractUploadedDocument } from "@content-engine/source-processing/adapters";
import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { enforceUserApiRateLimit } from "@/lib/api-rate-limit";
import { getBrandConfiguration } from "@/lib/brand-configuration";
import { canManageBrand } from "@/lib/permissions";
import { persistNormalizedSource } from "@/lib/persist-normalized-source";
import { persistSourceFailure } from "@/lib/persist-source-failure";
import { isSameOriginRequest } from "@/lib/request-origin";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const uploadMetadataSchema = z.object({
  brandId: z.uuid(),
  idempotencyKey: z.string().trim().min(16).max(200),
  language: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
  rightsNotes: z.string().trim().max(2_000).optional(),
});

const allowedMediaTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/vtt",
  "application/x-subrip",
]);

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function safeFilename(value: string) {
  const sanitized = value
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  return sanitized || "source";
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return failure(403, "origin_rejected", "Cross-origin upload is not allowed.");
  }
  const user = await getCurrentUser();
  if (!user) return failure(401, "authentication_required", "Sign in to upload a source.");
  const rateLimited = await enforceUserApiRateLimit({ request, userId: user.id });
  if (rateLimited) return rateLimited;
  if (!canManageBrand(user.role)) {
    return failure(403, "editor_role_required", "Your role cannot upload sources.");
  }
  const form = await request.formData().catch(() => null);
  if (!form) return failure(400, "invalid_multipart", "Upload must use multipart form data.");
  const parsed = uploadMetadataSchema.safeParse({
    brandId: form.get("brandId"),
    idempotencyKey: form.get("idempotencyKey"),
    language: form.get("language"),
    rightsNotes: form.get("rightsNotes") || undefined,
  });
  if (!parsed.success) {
    return failure(
      422,
      "invalid_upload_metadata",
      parsed.error.issues[0]?.message ?? "Invalid upload.",
    );
  }
  if (!(await getBrandConfiguration(parsed.data.brandId))) {
    return failure(404, "brand_not_found", "Brand not found or not assigned.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return failure(422, "file_required", "Choose a source file.");
  if (!allowedMediaTypes.has(file.type)) {
    return failure(415, "unsupported_type", "Supported files are PDF, DOCX, TXT, VTT, and SRT.");
  }
  if (file.size < 1 || file.size > 25_000_000) {
    return failure(413, "invalid_file_size", "Source files must be between 1 byte and 25 MB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let storagePath: string | undefined;
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") {
    storagePath = `${user.organizationId}/${parsed.data.brandId}/${crypto.randomUUID()}/${safeFilename(file.name)}`;
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.storage.from("source-originals").upload(storagePath, bytes, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
    if (error)
      return failure(500, "original_storage_failed", "The original file could not be stored.");
  }
  const adapterResult = await extractUploadedDocument({
    bytes,
    mediaType: file.type,
    filename: file.name,
    language: parsed.data.language,
    provenance: {
      submittedBy: user.id,
      receivedAt: new Date().toISOString(),
      originalFilename: file.name,
      rightsNotes: parsed.data.rightsNotes,
    },
  });
  if (adapterResult.outcome === "failure") {
    return persistSourceFailure({
      actorId: user.id,
      brandId: parsed.data.brandId,
      idempotencyKey: parsed.data.idempotencyKey,
      sourceType: file.type === "application/pdf" ? "pdf" : "transcript",
      title: file.name,
      failure: adapterResult,
      storagePath,
      rawSha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return persistNormalizedSource({
    request,
    actorId: user.id,
    organizationId: user.organizationId,
    brandId: parsed.data.brandId,
    idempotencyKey: parsed.data.idempotencyKey,
    sourceType: adapterResult.sourceType === "pdf" ? "pdf" : "transcript",
    source: adapterResult,
    rightsNotes: parsed.data.rightsNotes,
    storagePath,
  });
}
