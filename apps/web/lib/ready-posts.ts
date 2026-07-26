import "server-only";
import { postContentSchema } from "@content-engine/contracts";
import { cookies } from "next/headers";
import { z } from "zod";
import { parseDemoDraftRecords } from "./demo-content-store";
import { createSupabaseServerClient } from "./supabase/server";

const readyPostStatusSchema = z.enum(["ready_for_review", "changes_requested"]);

export type ReadyPost = {
  id: string;
  opportunityId: string;
  sourceTitle: string;
  contentStyle: string;
  tone: string;
  status: z.infer<typeof readyPostStatusSchema>;
  qualityScore: number | null;
  versionNumber: number;
  hook: string;
  excerpt: string;
  updatedAt: string;
};

export async function getReadyPosts(brandId: string): Promise<ReadyPost[]> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const cookieStore = await cookies();
    return parseDemoDraftRecords(cookieStore.get("demo-draft-records")?.value)
      .filter(
        (draft) =>
          draft.brandId === brandId &&
          (draft.status === "ready_for_review" || draft.status === "changes_requested"),
      )
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .map((draft) => ({
        id: draft.postDraftId,
        opportunityId: draft.opportunityId,
        sourceTitle: "Generated from submitted source",
        contentStyle: draft.contentStyle,
        tone: draft.tone,
        status: readyPostStatusSchema.parse(draft.status),
        qualityScore: draft.evaluation.qualityScore,
        versionNumber: draft.versionNumber,
        hook: draft.content.hook,
        excerpt: draft.content.body.slice(0, 220),
        updatedAt: draft.createdAt,
      }));
  }

  const supabase = await createSupabaseServerClient();
  const { data: drafts, error: draftError } = await supabase
    .from("post_drafts")
    .select(
      "id,opportunity_id,content_style,tone,status,quality_score,current_version_id,updated_at,opportunities(source_documents(title))",
    )
    .eq("brand_id", brandId)
    .in("status", ["ready_for_review", "changes_requested"])
    .order("updated_at", { ascending: false });
  if (draftError) throw new Error(`Unable to load ready posts: ${draftError.message}`);
  if (!drafts?.length) return [];

  const versionIds = drafts
    .map((draft) => draft.current_version_id)
    .filter((id): id is string => Boolean(id));
  const { data: versions, error: versionError } = await supabase
    .from("post_versions")
    .select("id,version_number,hook,body,closing,full_text")
    .in("id", versionIds);
  if (versionError) throw new Error(`Unable to load ready post versions: ${versionError.message}`);
  const versionsById = new Map((versions ?? []).map((version) => [version.id, version]));

  return drafts.flatMap((draft) => {
    const version = draft.current_version_id ? versionsById.get(draft.current_version_id) : null;
    if (!version) return [];
    const content = postContentSchema.parse({
      hook: version.hook,
      body: version.body,
      closing: version.closing ?? "",
      fullText: version.full_text,
    });
    const opportunity = Array.isArray(draft.opportunities)
      ? draft.opportunities[0]
      : draft.opportunities;
    const source = Array.isArray(opportunity?.source_documents)
      ? opportunity.source_documents[0]
      : opportunity?.source_documents;

    return [
      {
        id: draft.id,
        opportunityId: draft.opportunity_id,
        sourceTitle: source?.title ?? "Original source",
        contentStyle: draft.content_style,
        tone: draft.tone,
        status: readyPostStatusSchema.parse(draft.status),
        qualityScore: draft.quality_score === null ? null : Number(draft.quality_score),
        versionNumber: version.version_number,
        hook: content.hook,
        excerpt: content.body.slice(0, 220),
        updatedAt: draft.updated_at,
      },
    ];
  });
}
