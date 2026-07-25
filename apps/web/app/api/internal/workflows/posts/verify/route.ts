import { postVerificationWorkflowRequestSchema } from "@content-engine/contracts";
import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { EditorialWorkflowError, verifyWorkflowPost } from "@/lib/editorial-workflows";
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
    const payload = postVerificationWorkflowRequestSchema.parse(JSON.parse(rawBody));
    const result = await verifyWorkflowPost(payload);
    return NextResponse.json(result, {
      status: result.duplicate ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof WorkflowAuthError) {
      return failure(error.status, error.code, error.message);
    }
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return failure(400, "invalid_request", "The verification workflow contract is invalid.");
    }
    if (error instanceof EditorialWorkflowError) {
      return failure(error.status, error.code, error.message);
    }
    return failure(
      500,
      "verification_workflow_failed",
      "Post verification could not be completed.",
    );
  }
}
