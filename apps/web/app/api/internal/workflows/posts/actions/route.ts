import { postActionWorkflowRequestSchema } from "@content-engine/contracts";
import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { EditorialWorkflowError, regenerateWorkflowPost } from "@/lib/editorial-workflows";
import { authenticateWorkflowRequest, WorkflowAuthError } from "@/lib/workflow-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  try {
    await authenticateWorkflowRequest(request, rawBody);
    const payload = postActionWorkflowRequestSchema.parse(JSON.parse(rawBody));
    const result = await regenerateWorkflowPost(payload);
    return NextResponse.json(result, {
      status: result.duplicate ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof WorkflowAuthError) {
      return failure(error.status, error.code, error.message);
    }
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return failure(400, "invalid_request", "The content-action workflow contract is invalid.");
    }
    if (error instanceof EditorialWorkflowError) {
      return failure(error.status, error.code, error.message);
    }
    return failure(500, "content_action_failed", "The content action could not be completed.");
  }
}
