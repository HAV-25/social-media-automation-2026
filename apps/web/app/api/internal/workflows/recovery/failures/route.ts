import { workflowRecoveryFailureSchema } from "@content-engine/contracts";
import { ZodError } from "zod";
import { recordWorkflowFailure } from "@/lib/recovery";
import { authenticateWorkflowRequest, WorkflowAuthError } from "@/lib/workflow-auth";

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    await authenticateWorkflowRequest(request, rawBody);
    const input = workflowRecoveryFailureSchema.parse(JSON.parse(rawBody));
    return Response.json(await recordWorkflowFailure(input));
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
            code: "invalid_recovery_failure",
            message: "Recovery failure metadata failed validation.",
          },
        },
        { status: 400 },
      );
    }
    return Response.json(
      {
        error: {
          code: "recovery_failure_persistence_failed",
          message: "The workflow failure could not be recorded.",
        },
      },
      { status: 503 },
    );
  }
}
