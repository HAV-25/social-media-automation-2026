import {
  angleCandidateSchema,
  draftEvaluationSchema,
  postContentSchema,
  type AngleCandidate,
  type DraftEvaluation,
} from "@content-engine/contracts";
import { cookies } from "next/headers";
import { z } from "zod";
import { parseDemoContentRecords, parseDemoDraftRecords } from "./demo-content-store";
import { createSupabaseServerClient } from "./supabase/server";

const postStatusSchema = z.enum(["ready_for_review", "changes_requested", "approved", "rejected"]);

export type PostDetail = {
  id: string;
  brandId: string;
  opportunityId: string;
  sourceTitle: string;
  valueNucleus: string;
  contentStyle: string;
  tone: string;
  status: z.infer<typeof postStatusSchema>;
  qualityScore: number | null;
  angles: AngleCandidate[];
  selectedAngleKey: string | null;
  evaluation: DraftEvaluation | null;
  revisionCount: number;
  currentVersion: {
    id: string;
    versionNumber: number;
    content: z.infer<typeof postContentSchema>;
    generationType: string;
    model: string | null;
    promptVersion: string | null;
    createdAt: string;
  };
  versions: Array<{
    id: string;
    versionNumber: number;
    content: z.infer<typeof postContentSchema>;
    generationType: string;
    createdAt: string;
  }>;
  versionCount: number;
  provenance: {
    model: string | null;
    promptVersion: string | null;
    responseId: string | null;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  feedback: Array<{
    eventType: string;
    reason: string;
    createdAt: string;
  }>;
};

export async function getPostDetail(postDraftId: string): Promise<PostDetail | null> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const cookieStore = await cookies();
    const draft = parseDemoDraftRecords(cookieStore.get("demo-draft-records")?.value).find(
      (record) => record.postDraftId === postDraftId,
    );
    if (!draft) return null;
    const source = parseDemoContentRecords(cookieStore.get("demo-content-records")?.value).find(
      (record) => record.opportunityId === draft.opportunityId,
    );
    return {
      id: draft.postDraftId,
      brandId: draft.brandId,
      opportunityId: draft.opportunityId,
      sourceTitle: source?.title ?? "Original input",
      valueNucleus: source?.nucleus ?? draft.content.hook,
      contentStyle: draft.contentStyle,
      tone: draft.tone,
      status: postStatusSchema.parse(draft.status),
      qualityScore: draft.evaluation.qualityScore,
      angles: draft.angles,
      selectedAngleKey: draft.selectedAngleKey,
      evaluation: draft.evaluation,
      revisionCount: draft.revisionCount,
      currentVersion: {
        id: draft.postVersionId,
        versionNumber: draft.versionNumber,
        content: draft.content,
        generationType: "initial",
        model: draft.model,
        promptVersion: draft.promptVersion,
        createdAt: draft.createdAt,
      },
      versions: [...draft.versions]
        .sort((left, right) => right.versionNumber - left.versionNumber)
        .map((version) => ({
          id: version.id,
          versionNumber: version.versionNumber,
          content: version.content,
          generationType: version.generationType,
          createdAt: version.createdAt,
        })),
      versionCount: draft.versions.length,
      provenance: {
        model: draft.model,
        promptVersion: draft.promptVersion,
        responseId: draft.responseId,
        inputTokens: draft.inputTokens,
        outputTokens: draft.outputTokens,
        costUsd: 0,
      },
      feedback: draft.feedback,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: draft, error: draftError } = await supabase
    .from("post_drafts")
    .select(
      "id,brand_id,opportunity_id,content_style,tone,status,quality_score,score_breakdown,current_version_id",
    )
    .eq("id", postDraftId)
    .maybeSingle();
  if (draftError) throw new Error(`Unable to load post draft: ${draftError.message}`);
  if (!draft?.current_version_id) return null;

  const [
    { data: version, error: versionError },
    { data: versions, error: versionsError },
    { data: opportunity, error: opportunityError },
    { data: runs, error: runError },
    { data: feedback, error: feedbackError },
  ] = await Promise.all([
    supabase
      .from("post_versions")
      .select(
        "id,version_number,hook,body,closing,full_text,generation_type,model,prompt_version,created_at",
      )
      .eq("id", draft.current_version_id)
      .maybeSingle(),
    supabase
      .from("post_versions")
      .select("id,version_number,hook,body,closing,full_text,generation_type,created_at")
      .eq("post_draft_id", postDraftId)
      .order("version_number", { ascending: false }),
    supabase
      .from("opportunities")
      .select("value_nucleus,source_documents(title)")
      .eq("id", draft.opportunity_id)
      .maybeSingle(),
    supabase
      .from("generation_runs")
      .select("model_usage")
      .eq("entity_type", "post_draft")
      .eq("entity_id", postDraftId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("feedback_events")
      .select("event_type,reason,created_at")
      .eq("post_draft_id", postDraftId)
      .order("created_at", { ascending: false }),
  ]);
  const firstError = versionError ?? versionsError ?? opportunityError ?? runError ?? feedbackError;
  if (firstError) throw new Error(`Unable to load post review data: ${firstError.message}`);
  if (!version) return null;
  const source = Array.isArray(opportunity?.source_documents)
    ? opportunity.source_documents[0]
    : opportunity?.source_documents;
  const usage = z
    .object({
      model: z.string().nullable().optional(),
      promptVersion: z.string().nullable().optional(),
      responseId: z.string().nullable().optional(),
      usage: z
        .object({
          inputTokens: z.number().int().nonnegative().default(0),
          outputTokens: z.number().int().nonnegative().default(0),
        })
        .default({ inputTokens: 0, outputTokens: 0 }),
      costUsd: z.number().nonnegative().default(0),
    })
    .parse(runs?.[0]?.model_usage ?? {});
  const editorialMetadata = z
    .object({
      angles: z.array(angleCandidateSchema).length(3),
      selectedAngleKey: z.string().regex(/^angle_[a-z0-9]{6,40}$/),
      evaluation: draftEvaluationSchema,
      revisionCount: z.number().int().min(0).max(2),
    })
    .safeParse(draft.score_breakdown);

  return {
    id: draft.id,
    brandId: draft.brand_id,
    opportunityId: draft.opportunity_id,
    sourceTitle: source?.title ?? "Original input",
    valueNucleus: opportunity?.value_nucleus ?? version.hook,
    contentStyle: draft.content_style,
    tone: draft.tone,
    status: postStatusSchema.parse(draft.status),
    qualityScore: draft.quality_score === null ? null : Number(draft.quality_score),
    angles: editorialMetadata.success ? editorialMetadata.data.angles : [],
    selectedAngleKey: editorialMetadata.success ? editorialMetadata.data.selectedAngleKey : null,
    evaluation: editorialMetadata.success ? editorialMetadata.data.evaluation : null,
    revisionCount: editorialMetadata.success ? editorialMetadata.data.revisionCount : 0,
    currentVersion: {
      id: version.id,
      versionNumber: version.version_number,
      content: postContentSchema.parse({
        hook: version.hook,
        body: version.body,
        closing: version.closing ?? "",
        fullText: version.full_text,
      }),
      generationType: version.generation_type,
      model: version.model,
      promptVersion: version.prompt_version,
      createdAt: version.created_at,
    },
    versions: (versions ?? []).map((item) => ({
      id: item.id,
      versionNumber: item.version_number,
      content: postContentSchema.parse({
        hook: item.hook,
        body: item.body,
        closing: item.closing ?? "",
        fullText: item.full_text,
      }),
      generationType: item.generation_type,
      createdAt: item.created_at,
    })),
    versionCount: versions?.length ?? 0,
    provenance: {
      model: usage.model ?? version.model,
      promptVersion: usage.promptVersion ?? version.prompt_version,
      responseId: usage.responseId ?? null,
      inputTokens: usage.usage.inputTokens,
      outputTokens: usage.usage.outputTokens,
      costUsd: usage.costUsd,
    },
    feedback: (feedback ?? []).map((item) => ({
      eventType: item.event_type,
      reason: item.reason ?? "",
      createdAt: item.created_at,
    })),
  };
}
