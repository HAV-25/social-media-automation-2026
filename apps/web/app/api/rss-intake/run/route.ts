import {
  rssManualRunRequestSchema,
  rssManualRunResultSchema,
  serverEnvSchema,
} from "@content-engine/contracts";
import { signWorkflowRequest } from "@content-engine/security";
import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceUserApiRateLimit } from "@/lib/api-rate-limit";
import { getBrandConfiguration } from "@/lib/brand-configuration";
import { canManageBrand } from "@/lib/permissions";
import { isSameOriginRequest } from "@/lib/request-origin";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const workflowName = "WF-01 RSS Intake";
const workflowPath = "/webhook/rss-intake-run-v1";

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return failure(403, "origin_rejected", "Cross-origin workflow requests are not allowed.");
  }
  const user = await getCurrentUser();
  if (!user) return failure(401, "authentication_required", "Sign in to start RSS intake.");
  const rateLimited = await enforceUserApiRateLimit({ request, userId: user.id });
  if (rateLimited) return rateLimited;
  if (!canManageBrand(user.role)) {
    return failure(403, "editor_role_required", "Your role cannot start RSS intake.");
  }

  const clientRequest = await request.json().catch(() => null);
  const parsed = rssManualRunRequestSchema.safeParse({
    ...((clientRequest && typeof clientRequest === "object" ? clientRequest : {}) as object),
    actorId: user.id,
    requestedAt: new Date().toISOString(),
  });
  if (!parsed.success) {
    return failure(
      422,
      "invalid_run_request",
      parsed.error.issues[0]?.message ?? "The RSS run request is invalid.",
    );
  }
  if (!(await getBrandConfiguration(parsed.data.brandId))) {
    return failure(404, "brand_not_found", "Brand not found or not assigned.");
  }

  const supabase = createSupabaseServiceClient();
  const { data: createdRun, error: createError } = await supabase
    .from("generation_runs")
    .insert({
      organization_id: user.organizationId,
      brand_id: parsed.data.brandId,
      run_type: "rss_intake_dispatch",
      entity_type: "brand",
      entity_id: parsed.data.brandId,
      workflow_name: `${workflowName} (manual dispatch)`,
      correlation_id: parsed.data.correlationId,
      idempotency_key: parsed.data.idempotencyKey,
      status: "queued",
    })
    .select("id,status")
    .single();

  if (createError?.code === "23505") {
    const { data: existingRun } = await supabase
      .from("generation_runs")
      .select("id,status")
      .eq("organization_id", user.organizationId)
      .eq("workflow_name", `${workflowName} (manual dispatch)`)
      .eq("idempotency_key", parsed.data.idempotencyKey)
      .eq("attempt", 1)
      .maybeSingle();
    if (existingRun) {
      return NextResponse.json(
        rssManualRunResultSchema.parse({
          contractVersion: "1.0",
          generationRunId: existingRun.id,
          duplicate: true,
          status: existingRun.status === "failed" ? "failed" : "accepted",
        }),
        { status: existingRun.status === "failed" ? 503 : 200 },
      );
    }
  }
  if (createError || !createdRun) {
    return failure(500, "run_persistence_failed", "The RSS intake run could not be recorded.");
  }

  const body = JSON.stringify(parsed.data);
  const env = serverEnvSchema.parse(process.env);
  if (!env.WORKFLOW_HMAC_SECRET) {
    await supabase
      .from("generation_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: { code: "workflow_auth_unavailable" },
      })
      .eq("id", createdRun.id);
    return failure(503, "workflow_auth_unavailable", "Workflow authentication is not configured.");
  }
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const nonce = randomUUID();
  let response: Response;
  try {
    response = await fetch(`${env.N8N_WEBHOOK_BASE_URL.replace(/\/+$/, "")}${workflowPath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-workflow-name": "Editorial Desk",
        "x-workflow-nonce": nonce,
        "x-workflow-timestamp": timestamp,
        "x-workflow-signature": signWorkflowRequest(
          { body, method: "POST", nonce, path: workflowPath, timestamp },
          env.WORKFLOW_HMAC_SECRET,
        ),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    response = new Response(null, { status: 503 });
  }

  const completedAt = new Date().toISOString();
  if (!response.ok) {
    await supabase
      .from("generation_runs")
      .update({
        status: "failed",
        started_at: parsed.data.requestedAt,
        completed_at: completedAt,
        error: { code: "n8n_trigger_unavailable" },
      })
      .eq("id", createdRun.id);
    return failure(
      503,
      "n8n_trigger_unavailable",
      "n8n did not accept the RSS intake request. Check Runs & errors and retry.",
    );
  }

  const [{ error: runError }, { error: eventError }, { error: auditError }] = await Promise.all([
    supabase
      .from("generation_runs")
      .update({
        status: "succeeded",
        started_at: parsed.data.requestedAt,
        completed_at: completedAt,
      })
      .eq("id", createdRun.id),
    supabase.from("pipeline_events").insert({
      organization_id: user.organizationId,
      brand_id: parsed.data.brandId,
      generation_run_id: createdRun.id,
      entity_type: "brand",
      entity_id: parsed.data.brandId,
      event_type: "rss_manual_dispatch_accepted",
      from_status: "queued",
      to_status: "succeeded",
      correlation_id: parsed.data.correlationId,
      actor_id: user.id,
      metadata: { workflowName },
    }),
    supabase.from("audit_logs").insert({
      organization_id: user.organizationId,
      brand_id: parsed.data.brandId,
      actor_id: user.id,
      action: "rss.intake.manual_dispatch",
      entity_type: "generation_run",
      entity_id: createdRun.id,
      metadata: { workflowName },
    }),
  ]);
  if (runError || eventError || auditError) {
    return failure(
      500,
      "dispatch_persistence_failed",
      "n8n accepted the request, but its audit state could not be fully recorded.",
    );
  }

  return NextResponse.json(
    rssManualRunResultSchema.parse({
      contractVersion: "1.0",
      generationRunId: createdRun.id,
      duplicate: false,
      status: "accepted",
    }),
    { status: 202 },
  );
}
