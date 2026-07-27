import {
  rssGenerationReservationRequestSchema,
  rssGenerationReservationResultSchema,
} from "@content-engine/contracts";
import { sha256Hex } from "@content-engine/security";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { authenticateWorkflowRequest, WorkflowAuthError } from "@/lib/workflow-auth";

export const dynamic = "force-dynamic";

const reservationRowSchema = z.object({
  eligible: z.boolean(),
  reason: z.enum([
    "reserved",
    "already_prepared",
    "ingest_only",
    "below_threshold",
    "daily_limit",
    "inactive",
  ]),
  generation_run_id: z.uuid().nullable(),
  used_today: z.number().int().nonnegative(),
  daily_limit: z.number().int().nonnegative(),
  duplicate: z.boolean(),
});

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    await authenticateWorkflowRequest(request, rawBody);
    const payload = rssGenerationReservationRequestSchema.parse(JSON.parse(rawBody));
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .rpc("reserve_rss_generation", {
        payload: {
          ...payload,
          requestHash: sha256Hex(
            JSON.stringify({
              feedId: payload.feedId,
              brandId: payload.brandId,
              sourceDocumentId: payload.sourceDocumentId,
              opportunityId: payload.opportunityId,
              opportunityScore: payload.opportunityScore,
            }),
          ),
        },
      })
      .single();
    if (error) throw error;
    const row = reservationRowSchema.parse(data);
    return NextResponse.json(
      rssGenerationReservationResultSchema.parse({
        contractVersion: "1.0",
        eligible: row.eligible,
        reason: row.reason,
        generationRunId: row.generation_run_id ?? undefined,
        usedToday: row.used_today,
        dailyLimit: row.daily_limit,
        duplicate: row.duplicate,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof WorkflowAuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: "Reservation contract is invalid." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: { code: "reservation_failed", message: "Generation could not be reserved." } },
      { status: 500 },
    );
  }
}
