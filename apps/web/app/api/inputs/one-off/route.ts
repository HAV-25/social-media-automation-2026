import { oneOffJsonInputSchema } from "@content-engine/contracts";
import {
  extractPastedSocial,
  extractTranscript,
  fetchAndExtractUrl,
} from "@content-engine/source-processing/adapters";
import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceUserApiRateLimit } from "@/lib/api-rate-limit";
import { getBrandConfiguration } from "@/lib/brand-configuration";
import { canManageBrand } from "@/lib/permissions";
import { persistNormalizedSource } from "@/lib/persist-normalized-source";
import { persistSourceFailure } from "@/lib/persist-source-failure";
import { isSameOriginRequest } from "@/lib/request-origin";

export const runtime = "nodejs";

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return failure(403, "origin_rejected", "Cross-origin input submission is not allowed.");
  }
  const user = await getCurrentUser();
  if (!user) return failure(401, "authentication_required", "Sign in to submit a source.");
  const rateLimited = await enforceUserApiRateLimit({ request, userId: user.id });
  if (rateLimited) return rateLimited;
  if (!canManageBrand(user.role)) {
    return failure(403, "editor_role_required", "Your role cannot create inputs.");
  }
  const parsed = oneOffJsonInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return failure(422, "invalid_input", parsed.error.issues[0]?.message ?? "Input is invalid.");
  }
  if (!(await getBrandConfiguration(parsed.data.brandId))) {
    return failure(404, "brand_not_found", "Brand not found or not assigned.");
  }

  const provenance = {
    submittedBy: user.id,
    receivedAt: new Date().toISOString(),
    rightsNotes: parsed.data.rightsNotes || undefined,
  };
  const adapterResult =
    parsed.data.sourceType === "url"
      ? await fetchAndExtractUrl({
          url: parsed.data.url,
          language: parsed.data.language,
          provenance,
        })
      : parsed.data.sourceType === "transcript"
        ? extractTranscript({
            title: parsed.data.title,
            text: parsed.data.text,
            language: parsed.data.language,
            provenance,
          })
        : extractPastedSocial({
            title: parsed.data.title,
            text: parsed.data.text,
            language: parsed.data.language,
            sourceUrl: parsed.data.sourceUrl,
            engagement: parsed.data.engagement,
            provenance,
          });
  if (adapterResult.outcome === "failure") {
    return persistSourceFailure({
      actorId: user.id,
      brandId: parsed.data.brandId,
      idempotencyKey: parsed.data.idempotencyKey,
      sourceType: parsed.data.sourceType,
      title:
        parsed.data.sourceType === "url" ? new URL(parsed.data.url).hostname : parsed.data.title,
      failure: adapterResult,
      canonicalUrl: parsed.data.sourceType === "url" ? parsed.data.url : undefined,
    });
  }
  return persistNormalizedSource({
    request,
    actorId: user.id,
    organizationId: user.organizationId,
    brandId: parsed.data.brandId,
    idempotencyKey: parsed.data.idempotencyKey,
    sourceType: parsed.data.sourceType,
    source: adapterResult,
    rawText: parsed.data.sourceType === "url" ? null : parsed.data.text,
    rightsNotes: parsed.data.rightsNotes,
  });
}
