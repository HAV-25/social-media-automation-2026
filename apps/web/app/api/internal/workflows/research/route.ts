import { ResearchProviderError } from "@content-engine/ai";
import { researchRunResultSchema, researchWorkflowRequestSchema } from "@content-engine/contracts";
import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  createResearchPlan,
  failResearchRun,
  getResearchResultForGenerationRun,
  getOpportunityForWorkflow,
  persistResearchEvidence,
  produceResearchEvidence,
  reserveResearchBudget,
} from "@/lib/research";
import { authenticateWorkflowRequest, WorkflowAuthError } from "@/lib/workflow-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let actorId: string | undefined;
  let reservedRunId: string | undefined;
  try {
    await authenticateWorkflowRequest(request, rawBody);
    const payload = researchWorkflowRequestSchema.parse(JSON.parse(rawBody));
    actorId = payload.actorId;
    const opportunity = await getOpportunityForWorkflow(payload.opportunityId);
    if (!opportunity || opportunity.brandId !== payload.brandId) {
      return failure(404, "opportunity_not_found", "The research opportunity was not found.");
    }
    const plan = createResearchPlan(opportunity, payload.allowedDomains);
    const reservation = await reserveResearchBudget({
      actorId: payload.actorId,
      brandId: payload.brandId,
      correlationId: payload.correlationId,
      idempotencyKey: payload.idempotencyKey,
      opportunityId: payload.opportunityId,
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
      allowedDomains: payload.allowedDomains,
      plan,
    });
    const result = await persistResearchEvidence({
      actorId: payload.actorId,
      brandId: payload.brandId,
      correlationId: payload.correlationId,
      generationRunId: reservation.generationRunId,
      idempotencyKey: payload.idempotencyKey,
      opportunityId: payload.opportunityId,
      plan,
      providerResult,
    });
    return NextResponse.json(researchRunResultSchema.parse(result), {
      status: result.duplicate ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (actorId && reservedRunId) {
      await failResearchRun({
        actorId,
        generationRunId: reservedRunId,
        error,
      }).catch(() => undefined);
    }
    if (error instanceof WorkflowAuthError) {
      return failure(error.status, error.code, error.message);
    }
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return failure(400, "invalid_request", "The research workflow contract is invalid.");
    }
    if (error instanceof ResearchProviderError) {
      const status = error.code === "budget_exceeded" ? 422 : error.retryable ? 503 : 502;
      return failure(status, error.code, error.message);
    }
    return failure(500, "research_failed", "The research workflow could not be completed.");
  }
}
