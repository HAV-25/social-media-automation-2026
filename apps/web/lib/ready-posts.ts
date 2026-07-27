import "server-only";
import { postContentSchema } from "@content-engine/contracts";
import { cookies } from "next/headers";
import { parseDemoDraftRecords } from "./demo-content-store";
import {
  readyPostFiltersSchema,
  readyPostStatusSchema,
  readyPostWindowStart,
  type ReadyPostFilters,
  type ReadyPostStatus,
} from "./ready-post-filters";
import { createSupabaseServerClient } from "./supabase/server";

function filterAndSortReadyPosts(posts: ReadyPost[], filters: ReadyPostFilters) {
  const start = readyPostWindowStart(filters.window);
  return posts
    .filter(
      (post) =>
        (!start || Date.parse(post.updatedAt) >= start.getTime()) &&
        (filters.status === "all" || post.status === filters.status) &&
        (filters.style === "all" || post.contentStyle === filters.style) &&
        (filters.tone === "all" || post.tone === filters.tone),
    )
    .sort((left, right) => {
      if (filters.sort === "quality_desc" || filters.sort === "quality_asc") {
        if (left.qualityScore === null) return 1;
        if (right.qualityScore === null) return -1;
        const direction = filters.sort === "quality_desc" ? -1 : 1;
        return direction * (left.qualityScore - right.qualityScore);
      }
      const direction = filters.sort === "updated_desc" ? -1 : 1;
      return direction * (Date.parse(left.updatedAt) - Date.parse(right.updatedAt));
    });
}

export type ReadyPost = {
  id: string;
  opportunityId: string;
  sourceTitle: string;
  contentStyle: string;
  tone: string;
  status: ReadyPostStatus;
  qualityScore: number | null;
  versionNumber: number;
  hook: string;
  excerpt: string;
  updatedAt: string;
};

export async function getReadyPosts(
  brandId: string,
  rawFilters: ReadyPostFilters = readyPostFiltersSchema.parse({}),
): Promise<ReadyPost[]> {
  const filters = readyPostFiltersSchema.parse(rawFilters);
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const cookieStore = await cookies();
    return filterAndSortReadyPosts(
      parseDemoDraftRecords(cookieStore.get("demo-draft-records")?.value)
        .filter(
          (draft) =>
            draft.brandId === brandId &&
            (draft.status === "ready_for_review" || draft.status === "changes_requested"),
        )
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
        })),
      filters,
    );
  }

  const supabase = await createSupabaseServerClient();
  let draftQuery = supabase
    .from("post_drafts")
    .select(
      "id,opportunity_id,content_style,tone,status,quality_score,current_version_id,updated_at,opportunities(source_documents(title))",
    )
    .eq("brand_id", brandId)
    .in("status", ["ready_for_review", "changes_requested"]);
  if (filters.status !== "all") draftQuery = draftQuery.eq("status", filters.status);
  if (filters.style !== "all") draftQuery = draftQuery.eq("content_style", filters.style);
  if (filters.tone !== "all") draftQuery = draftQuery.eq("tone", filters.tone);
  const start = readyPostWindowStart(filters.window);
  if (start) draftQuery = draftQuery.gte("updated_at", start.toISOString());
  const sortColumn = filters.sort.startsWith("quality") ? "quality_score" : "updated_at";
  const ascending = filters.sort.endsWith("_asc");
  const { data: drafts, error: draftError } = await draftQuery.order(sortColumn, {
    ascending,
    nullsFirst: false,
  });
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
