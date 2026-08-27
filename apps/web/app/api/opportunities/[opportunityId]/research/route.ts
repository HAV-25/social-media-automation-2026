import { ResearchProviderError } from "@content-engine/ai";
import {
  researchQueuedResultSchema,
  researchRunResultSchema,
  researchStartRequestSchema,
  researchStatusSchema,
} from "@content-engine/contracts";
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
import { isSameOriginRequest } from "@/lib/request-origin";
import { createResearchPlan, getResearchEvidence, produceResearchEvidence } from "@/lib/research";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  if (!isSameOriginRequest(request)) {
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

  // Demo mode keeps the deterministic in-process research provider (no model
  // call, no paid web search) and stores the evidence in a cookie.
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    try {
      const plan = createResearchPlan(opportunity, parsed.data.allowedDomains);
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
    } catch (error) {
      if (error instanceof ResearchProviderError) {
        const status = error.code === "budget_exceeded" ? 422 : error.retryable ? 503 : 502;
        return failure(status, error.code, error.message);
      }
      return failure(500, "research_failed", "The bounded research run could not be completed.");
    }
  }

  // Real mode: enqueue the bounded research on the lightweight worker (as the
  // signed-in editor) instead of calling the research provider inline. The worker
  // is not bound by the serverless timeout and persists evidence via the pipeline;
  // the client polls the GET below until the evidence package lands.
  const authed = await createSupabaseServerClient();
  const { data, error } = await authed
    .rpc("request_lightweight_action", {
      payload: {
        brandId: opportunity.brandId,
        opportunityId,
        action: "research",
        idempotencyKey: parsed.data.idempotencyKey,
      },
    })
    .single();
  if (error) {
    if (error.code === "42501") {
      return failure(403, "reviewer_role_required", "Your role cannot start research.");
    }
    if (error.code === "23505") {
      return failure(
        409,
        "idempotency_conflict",
        "This idempotency key was already used for another research request.",
      );
    }
    if (error.code === "22023") {
      return failure(422, "invalid_research_request", "The research request is invalid.");
    }
    return failure(500, "research_enqueue_failed", "The research request could not be queued.");
  }
  const instance = data as { id?: string } | null;
  return NextResponse.json(
    researchQueuedResultSchema.parse({
      contractVersion: "1.0",
      status: "queued",
      pipelineInstanceId: instance?.id ?? null,
    }),
    { status: 202 },
  );
}

// Poll target: after enqueuing research the client polls here until the worker's
// evidence package has landed.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !canReviewContent(user.role)) {
    return failure(401, "authentication_required", "Sign in to view research status.");
  }
  const { opportunityId } = await params;
  const evidence = await getResearchEvidence(opportunityId);
  return NextResponse.json(
    researchStatusSchema.parse({
      contractVersion: "1.0",
      status: evidence ? "ready" : "pending",
      readyForWriting: evidence?.evidencePackage.readyForWriting ?? false,
      sourceCount: evidence?.evidencePackage.sources.length ?? 0,
      claimCount: evidence?.evidencePackage.claims.length ?? 0,
    }),
  );
}
