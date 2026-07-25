import { ResearchProviderError } from "@content-engine/ai";
import { researchRunResultSchema, researchStartRequestSchema } from "@content-engine/contracts";
import { sha256Hex } from "@content-engine/security";
import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceUserApiRateLimit } from "@/lib/api-rate-limit";
import {
  parseDemoResearchRecords,
  serializeDemoResearchRecords,
  uuidFromDeterministicHash,
  type DemoResearchRecord,
} from "@/lib/demo-content-store";
import { getOpportunityDetail } from "@/lib/opportunity-detail";
import { canReviewContent } from "@/lib/permissions";
import {
  createResearchPlan,
  failResearchRun,
  getResearchResultForGenerationRun,
  persistResearchEvidence,
  produceResearchEvidence,
  reserveResearchBudget,
} from "@/lib/research";

export const runtime = "nodejs";

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return failure(403, "origin_rejected", "Cross-origin research requests are not allowed.");
  }
  const user = await getCurrentUser();
  if (!user) return failure(401, "authentication_required", "Sign in to start research.");
  const rateLimited = await enforceUserApiRateLimit({ request, userId: user.id });
  if (rateLimited) return rateLimited;
  if (!canReviewContent(user.role)) {
    return failure(403, "reviewer_role_required", "Your role cannot start research.");
  }
  const parsed = researchStartRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return failure(
      422,
      "invalid_research_request",
      parsed.error.issues[0]?.message ?? "Research request failed validation.",
    );
  }
  const { opportunityId } = await params;
  const opportunity = await getOpportunityDetail(opportunityId);
  if (!opportunity) {
    return failure(404, "opportunity_not_found", "Opportunity not found or not assigned.");
  }

  let reservedRunId: string | undefined;
  try {
    const plan = createResearchPlan(opportunity, parsed.data.allowedDomains);

    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
      const { result: providerResult } = await produceResearchEvidence({
        opportunity,
        allowedDomains: parsed.data.allowedDomains,
        plan,
      });
      const existing = parseDemoResearchRecords(
        request.cookies.get("demo-research-records")?.value,
      ).find((record) => record.opportunityId === opportunityId);
      const researchRunId =
        existing?.researchRunId ??
        uuidFromDeterministicHash(sha256Hex(`${opportunityId}:research`));
      const generationRunId =
        existing?.generationRunId ??
        uuidFromDeterministicHash(sha256Hex(parsed.data.idempotencyKey));
      const record: DemoResearchRecord = {
        opportunityId,
        researchRunId,
        generationRunId,
        evidencePackage: providerResult.evidencePackage,
        model: providerResult.model,
        promptVersion: providerResult.promptVersion,
        responseId: providerResult.responseId,
        usage: providerResult.usage,
        createdAt: new Date().toISOString(),
      };
      const result = researchRunResultSchema.parse({
        contractVersion: "1.0",
        researchRunId,
        generationRunId,
        status: providerResult.evidencePackage.readyForWriting
          ? "evidence_ready"
          : "review_required",
        duplicate: Boolean(existing),
        readyForWriting: providerResult.evidencePackage.readyForWriting,
        sourceCount: providerResult.evidencePackage.sources.length,
        claimCount: providerResult.evidencePackage.claims.length,
      });
      const response = NextResponse.json(result, { status: existing ? 200 : 201 });
      response.cookies.set("demo-research-records", serializeDemoResearchRecords([record]), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 8,
      });
      return response;
    }

    const correlationId = crypto.randomUUID();
    const reservation = await reserveResearchBudget({
      actorId: user.id,
      brandId: opportunity.brandId,
      correlationId,
      idempotencyKey: parsed.data.idempotencyKey,
      opportunityId,
      plan,
    });
    if (reservation.duplicate) {
      const existingResult = await getResearchResultForGenerationRun(reservation.generationRunId);
      if (existingResult) return NextResponse.json(existingResult);
      return failure(
        409,
        "research_already_running",
        "This bounded research request is already running.",
      );
    }
    reservedRunId = reservation.generationRunId;
    const { result: providerResult } = await produceResearchEvidence({
      opportunity,
      allowedDomains: parsed.data.allowedDomains,
      plan,
    });
    const result = await persistResearchEvidence({
      actorId: user.id,
      brandId: opportunity.brandId,
      correlationId,
      generationRunId: reservation.generationRunId,
      idempotencyKey: parsed.data.idempotencyKey,
      opportunityId,
      plan,
      providerResult,
    });
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (reservedRunId) {
      await failResearchRun({
        actorId: user.id,
        generationRunId: reservedRunId,
        error,
      }).catch(() => undefined);
    }
    if (error instanceof ResearchProviderError) {
      const status = error.code === "budget_exceeded" ? 422 : error.retryable ? 503 : 502;
      return failure(status, error.code, error.message);
    }
    const databaseCode =
      error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (databaseCode === "23505") {
      return failure(
        409,
        "idempotency_conflict",
        "This idempotency key was already used for another research request.",
      );
    }
    return failure(500, "research_failed", "The bounded research run could not be completed.");
  }
}
