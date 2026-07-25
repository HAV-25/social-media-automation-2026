"use server";

import { manualRunRecoveryRequestSchema } from "@content-engine/contracts";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { parseDemoRecoveredRuns, serializeDemoRecoveredRuns } from "@/lib/demo-recovery-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const runIdSchema = z.uuid();

export async function requestManualRecovery(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.organizationRole !== "administrator") {
    redirect("/runs?error=Organization+administrator+role+required.");
  }
  const runId = runIdSchema.safeParse(formData.get("generationRunId"));
  const request = manualRunRecoveryRequestSchema.safeParse({
    contractVersion: "1.0",
    idempotencyKey: String(formData.get("idempotencyKey") || randomUUID()),
    reason: formData.get("reason"),
  });
  if (!runId.success || !request.success) {
    redirect("/runs?error=Recovery+request+failed+validation.");
  }

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const cookieStore = await cookies();
    const existing = parseDemoRecoveredRuns(cookieStore.get("demo-recovered-runs")?.value);
    cookieStore.set("demo-recovered-runs", serializeDemoRecoveredRuns([...existing, runId.data]), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
    redirect("/runs?recovery=queued");
  }

  const { error } = await (
    await createSupabaseServerClient()
  ).rpc("request_run_recovery", {
    payload: {
      actorId: user.id,
      generationRunId: runId.data,
      idempotencyKey: request.data.idempotencyKey,
      reason: request.data.reason,
    },
  });
  if (error) {
    const message =
      error.code === "P0002"
        ? "This run has no replayable execution context."
        : "The recovery request could not be queued.";
    redirect(`/runs?error=${encodeURIComponent(message)}`);
  }
  redirect("/runs?recovery=queued");
}
