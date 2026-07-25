import { NextResponse } from "next/server";
import { rssIntakeContractSchema, rssIntakeResultSchema } from "@content-engine/contracts";
import { ZodError } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { authenticateWorkflowRequest, WorkflowAuthError } from "@/lib/workflow-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();

  try {
    await authenticateWorkflowRequest(request, rawBody);
    const payload = rssIntakeContractSchema.parse(JSON.parse(rawBody));
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase.rpc("ingest_rss_item", { payload });
    if (error) throw error;

    const response = rssIntakeResultSchema.parse(data);
    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
      status: response.duplicate ? 200 : 201,
    });
  } catch (error) {
    if (error instanceof WorkflowAuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_request",
            message: "Request body does not match the RSS intake contract.",
          },
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: { code: "rss_intake_failed", message: "RSS intake could not be persisted." } },
      { status: 500 },
    );
  }
}
