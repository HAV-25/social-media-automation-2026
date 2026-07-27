import { imageWorkflowRequestSchema } from "@content-engine/contracts";
import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authenticateWorkflowRequest, WorkflowAuthError } from "@/lib/workflow-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function isImageWorkflowError(error: unknown): error is Error & { code: string; status: number } {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    "status" in error &&
    typeof error.status === "number"
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  try {
    await authenticateWorkflowRequest(request, rawBody);
    const payload = imageWorkflowRequestSchema.parse(JSON.parse(rawBody));
    const { generateWorkflowImage } = await import("@/lib/image-workflows");
    const result = await generateWorkflowImage(payload);
    return NextResponse.json(result, {
      status: result.duplicate ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof WorkflowAuthError) {
      return failure(error.status, error.code, error.message);
    }
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return failure(400, "invalid_request", "The image workflow contract is invalid.");
    }
    if (isImageWorkflowError(error)) {
      return failure(error.status, error.code, error.message);
    }
    return failure(500, "image_workflow_failed", "Image generation could not be completed.");
  }
}
