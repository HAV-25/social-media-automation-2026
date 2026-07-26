import {
  contentStyleSchema,
  draftGenerationResultSchema,
  toneSchema,
  type DraftGenerationResult,
  type EditorialWorkflowRequest,
} from "@content-engine/contracts";
import { z } from "zod";

const reusableDraftRowSchema = z.object({
  id: z.uuid(),
  current_version_id: z.uuid(),
  content_style: contentStyleSchema,
  tone: toneSchema,
  status: z.string(),
});

const reusableRunRowSchema = z.object({
  id: z.uuid(),
  entity_id: z.uuid(),
  created_at: z.iso.datetime(),
});

type ContentStyle = EditorialWorkflowRequest["contentStyles"][number];

export type DraftReusePlan = {
  reused: Array<{
    contentStyle: ContentStyle;
    result: DraftGenerationResult;
  }>;
  missingStyles: ContentStyle[];
  blockedStyles: ContentStyle[];
};

export function buildDraftReusePlan(input: {
  requestedStyles: ContentStyle[];
  rawDrafts: unknown;
  rawRuns: unknown;
}): DraftReusePlan {
  const drafts = z.array(reusableDraftRowSchema).parse(input.rawDrafts);
  const runs = z.array(reusableRunRowSchema).parse(input.rawRuns);
  const draftByStyle = new Map<ContentStyle, (typeof drafts)[number]>();
  for (const draft of drafts) {
    if (draftByStyle.has(draft.content_style)) {
      throw new Error(`Duplicate stored draft for style ${draft.content_style}`);
    }
    draftByStyle.set(draft.content_style, draft);
  }

  const latestRunByDraft = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    const current = latestRunByDraft.get(run.entity_id);
    if (!current || run.created_at > current.created_at) {
      latestRunByDraft.set(run.entity_id, run);
    }
  }

  const reused: DraftReusePlan["reused"] = [];
  const missingStyles: ContentStyle[] = [];
  const blockedStyles: ContentStyle[] = [];

  for (const contentStyle of input.requestedStyles) {
    const draft = draftByStyle.get(contentStyle);
    if (!draft) {
      missingStyles.push(contentStyle);
      continue;
    }
    const run = latestRunByDraft.get(draft.id);
    if (draft.status !== "ready_for_review" || !run) {
      blockedStyles.push(contentStyle);
      continue;
    }
    reused.push({
      contentStyle,
      result: draftGenerationResultSchema.parse({
        contractVersion: "1.0",
        postDraftId: draft.id,
        postVersionId: draft.current_version_id,
        generationRunId: run.id,
        status: "ready_for_review",
        duplicate: true,
      }),
    });
  }

  return { reused, missingStyles, blockedStyles };
}

export function orderDraftResults(input: {
  requestedStyles: ContentStyle[];
  reused: DraftReusePlan["reused"];
  generated: DraftReusePlan["reused"];
}): DraftGenerationResult[] {
  const results = new Map(
    [...input.reused, ...input.generated].map(({ contentStyle, result }) => [contentStyle, result]),
  );
  return input.requestedStyles.map((contentStyle) => {
    const result = results.get(contentStyle);
    if (!result) throw new Error(`Missing draft result for style ${contentStyle}`);
    return result;
  });
}
