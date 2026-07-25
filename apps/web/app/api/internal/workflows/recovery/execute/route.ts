import { workflowRecoveryExecutionSchema } from "@content-engine/contracts";
import { ZodError } from "zod";
import { executeRecoverableWorkflow } from "@/lib/recovery";
import { authenticateWorkflowRequest, WorkflowAuthError } from "@/lib/workflow-auth";
import { workflowJsonResponse } from "@/lib/workflow-response";

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    await authenticateWorkflowRequest(request, rawBody);
    const input = workflowRecoveryExecutionSchema.parse(JSON.parse(rawBody));
    const result = await executeRecoverableWorkflow(input);
    return workflowJsonResponse(result.body, { status: result.status });
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
            code: "invalid_recovery_execution",
            message: "Recovery execution failed validation.",
          },
        },
        { status: 400 },
      );
    }
    return Response.json(
      {
        error: {
          code: "recovery_execution_failed",
          message: "The recoverable workflow could not be completed.",
        },
      },
      { status: 503 },
    );
  }
}
