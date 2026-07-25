import {
  manualInputRequestSchema,
  sourceAdapterNormalizedResultSchema,
} from "@content-engine/contracts";
import { normalizeManualInput } from "@content-engine/source-processing";
import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceUserApiRateLimit } from "@/lib/api-rate-limit";
import { getBrandConfiguration } from "@/lib/brand-configuration";
import { canManageBrand } from "@/lib/permissions";
import { persistNormalizedSource } from "@/lib/persist-normalized-source";

export const runtime = "nodejs";

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return failure(403, "origin_rejected", "Cross-origin input submission is not allowed.");
  }
  const user = await getCurrentUser();
  if (!user) return failure(401, "authentication_required", "Sign in to submit a source.");
  const rateLimited = await enforceUserApiRateLimit({ request, userId: user.id });
  if (rateLimited) return rateLimited;
  if (!canManageBrand(user.role)) {
    return failure(403, "editor_role_required", "Your role cannot create inputs.");
  }
  const parsed = manualInputRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return failure(422, "invalid_input", parsed.error.issues[0]?.message ?? "Input is invalid.");
  }
  if (!(await getBrandConfiguration(parsed.data.brandId))) {
    return failure(404, "brand_not_found", "Brand not found or not assigned.");
  }
  const normalized = normalizeManualInput(parsed.data);
  if (normalized.cleanText.length < 20) {
    return failure(422, "content_too_short", "Normalized input must contain 20 characters.");
  }
  const source = sourceAdapterNormalizedResultSchema.parse({
    contractVersion: "1.0",
    outcome: "normalized",
    sourceType: "plain_text",
    title: normalized.title,
    cleanText: normalized.cleanText,
    contentHash: normalized.contentHash,
    language: normalized.language,
    sections: [{ index: 0, label: "Original input", text: normalized.cleanText }],
    requiresManualReview: false,
    reviewReasons: [],
    provenance: {
      submittedBy: user.id,
      receivedAt: new Date().toISOString(),
      rightsNotes: parsed.data.rightsNotes,
    },
  });
  return persistNormalizedSource({
    request,
    actorId: user.id,
    organizationId: user.organizationId,
    brandId: parsed.data.brandId,
    idempotencyKey: parsed.data.idempotencyKey,
    sourceType: "plain_text",
    source,
    rawText: parsed.data.text,
    rightsNotes: parsed.data.rightsNotes,
  });
}
