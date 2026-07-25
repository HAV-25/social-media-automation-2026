import { workflowRecoveryDispatchSchema } from "@content-engine/contracts";
import { ZodError } from "zod";
import { dispatchDueRecoveries } from "@/lib/recovery";
import { authenticateWorkflowRequest, WorkflowAuthError } from "@/lib/workflow-auth";

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    await authenticateWorkflowRequest(request, rawBody);
    const input = workflowRecoveryDispatchSchema.parse(JSON.parse(rawBody));
    const results = await dispatchDueRecoveries(input.limit);
    return Response.json({
      contractVersion: "1.0",
      claimed: results.length,
      results,
    });
  } catch (error) {
    if (error instanceof WorkflowAuthError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return Response.json(
        {
          error: {
            code: "invalid_recovery_dispatch",
            message: "Recovery dispatch request failed validation.",
          },
        },
        { status: 400 },
      );
    }
    return Response.json(
      {
        error: {
          code: "recovery_dispatch_failed",
          message: "Due recovery work could not be dispatched.",
        },
      },
      { status: 503 },
    );
  }
}
