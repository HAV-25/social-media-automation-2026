import "server-only";
import { buildImageGenerationPrompt } from "@content-engine/ai/image";
import {
  imageReviewActionRequestSchema,
  imageReviewActionResultSchema,
  imageTemplateSchema,
  type ImageDirection,
  type ImageReviewActionRequest,
  type ImageTemplate,
  type ImageValidation,
} from "@content-engine/contracts";
import { sha256Hex } from "@content-engine/security";
import { cookies } from "next/headers";
import { z } from "zod";
import { getBrandConfiguration } from "./brand-configuration";
import {
  parseDemoImageRecords,
  serializeDemoImageRecords,
  uuidFromDeterministicHash,
  type DemoImageRecord,
} from "./demo-content-store";
import {
  createReviewImageDirection,
  renderReviewImage,
  selectImageConcept,
  templateForStyle,
} from "./image-review-core";
import { generateWorkflowImage } from "./image-workflows";
import type { PostDetail } from "./post-detail";
import { createSupabaseServerClient } from "./supabase/server";

const DEMO_IMAGE_COOKIE = "demo-image-records";

const modelRecordSchema = z
  .object({
    model: z.string().optional(),
    promptVersion: z.string().optional(),
    responseId: z.string().optional(),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative().default(0),
        outputTokens: z.number().int().nonnegative().default(0),
        estimatedCostUsd: z.number().nonnegative().default(0),
      })
      .default({ inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 }),
  })
  .passthrough();

const persistentImageRowSchema = z.object({
  id: z.uuid(),
  post_version_id: z.uuid(),
  // Lightweight pipeline writes thinner concept/validation payloads than the
  // original strict contract; read them loosely and normalize in persistentState.
  concept_key: z.string(),
  concept_direction: z.unknown(),
  template: z.string(),
  validation: z.unknown(),
  base_image_path: z.string().min(1),
  final_image_path: z.string().min(1).nullable(),
  status: z.enum(["generating", "validation_required", "ready", "failed"]),
  model: z.string().min(1),
  prompt: z.string().nullable(),
  prompt_version: z.string().min(1),
  provider_response_id: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
});
type PersistentImageRow = z.infer<typeof persistentImageRowSchema>;

export type PostImageReviewState = {
  status: "concept_pending" | "validation_required" | "ready";
  imageAssetId: string | null;
  postVersionId: string;
  direction: ImageDirection;
  selectedConceptKey: string;
  template: ImageTemplate;
  validation: ImageValidation | null;
  model: string | null;
  prompt: string | null;
  promptVersion: string | null;
  providerResponseId: string | null;
  estimatedCostUsd: number;
  createdAt: string | null;
  baseImagePath: string | null;
  finalImagePath: string | null;
};

function pendingState(post: PostDetail, direction: ImageDirection): PostImageReviewState {
  const selected = direction.concepts.find(
    (concept) => concept.conceptKey === direction.selectedConceptKey,
  )!;
  return {
    status: "concept_pending",
    imageAssetId: null,
    postVersionId: post.currentVersion.id,
    direction,
    selectedConceptKey: direction.selectedConceptKey,
    template: templateForStyle(selected.imageStyle),
    validation: null,
    model: null,
    prompt: null,
    promptVersion: null,
    providerResponseId: null,
    estimatedCostUsd: 0,
    createdAt: null,
    baseImagePath: null,
    finalImagePath: null,
  };
}

function demoState(record: DemoImageRecord): PostImageReviewState {
  const concept = record.imageDirection.concepts.find(
    (candidate) => candidate.conceptKey === record.selectedConceptKey,
  );
  return {
    status: "ready",
    imageAssetId: record.imageAssetId,
    postVersionId: record.postVersionId,
    direction: record.imageDirection,
    selectedConceptKey: record.selectedConceptKey,
    template: record.template,
    validation: record.validation,
    model: record.model,
    prompt: concept ? buildImageGenerationPrompt(concept) : null,
    promptVersion: record.promptVersion,
    providerResponseId: record.providerResponseId,
    estimatedCostUsd: record.estimatedCostUsd,
    createdAt: record.createdAt,
    baseImagePath: null,
    finalImagePath: null,
  };
}

function normalizeConcept(raw: unknown, index: number) {
  const concept = (raw ?? {}) as Record<string, unknown>;
  return {
    conceptKey: String(concept.conceptKey ?? `concept_${index + 1}`),
    title: String(concept.title ?? "Concept"),
    visualNucleus: String(concept.visualNucleus ?? ""),
    imageStyle: String(concept.imageStyle ?? "editorial_hero"),
    literalOrConceptual: String(concept.literalOrConceptual ?? "conceptual"),
    composition: String(concept.composition ?? ""),
    palette: Array.isArray(concept.palette) ? concept.palette : [],
    avoid: Array.isArray(concept.avoid) ? concept.avoid : [],
    headlineOverlay: String(concept.headlineOverlay ?? ""),
    sourceLabel: String(concept.sourceLabel ?? ""),
    rank: typeof concept.rank === "number" ? concept.rank : index + 1,
    score: typeof concept.score === "number" ? concept.score : 0,
    rankExplanation: String(concept.rankExplanation ?? ""),
  };
}

function persistentState(row: PersistentImageRow): PostImageReviewState {
  const modelRecord = modelRecordSchema.safeParse(row.metadata.modelRecord);
  // The lightweight pipeline stores thinner concept/validation payloads; normalize
  // them into the exact shape the review UI reads so rendering never hits undefined.
  const rawDirection = (row.concept_direction ?? {}) as Record<string, unknown>;
  const rawConcepts = Array.isArray(rawDirection.concepts) ? rawDirection.concepts : [];
  const direction = {
    contractVersion: "1.0",
    selectedConceptKey: String(rawDirection.selectedConceptKey ?? row.concept_key),
    concepts: rawConcepts.map((concept, index) => normalizeConcept(concept, index)),
  } as unknown as ImageDirection;
  const rawValidation = (row.validation ?? null) as Record<string, unknown> | null;
  const validation = rawValidation
    ? ({
        ...rawValidation,
        width: typeof rawValidation.width === "number" ? rawValidation.width : 1200,
        height: typeof rawValidation.height === "number" ? rawValidation.height : 630,
        warnings: Array.isArray(rawValidation.warnings) ? rawValidation.warnings : [],
      } as unknown as ImageValidation)
    : null;
  return {
    status: row.status === "ready" ? "ready" : "validation_required",
    imageAssetId: row.id,
    postVersionId: row.post_version_id,
    direction,
    selectedConceptKey: row.concept_key,
    template: row.template as ImageTemplate,
    validation,
    model: row.model,
    prompt: row.prompt,
    promptVersion: row.prompt_version,
    providerResponseId: row.provider_response_id,
    estimatedCostUsd: modelRecord.success ? modelRecord.data.usage.estimatedCostUsd : 0,
    createdAt: row.created_at,
    baseImagePath: row.base_image_path,
    finalImagePath: row.final_image_path,
  };
}

async function defaultDirection(post: PostDetail) {
  const brand = await getBrandConfiguration(post.brandId);
  if (!brand) throw new Error("Brand configuration is unavailable.");
  return {
    brand,
    direction: createReviewImageDirection({
      directionSeed: post.currentVersion.id,
      postText: post.currentVersion.content.fullText,
      valueNucleus: post.valueNucleus,
      contentStyle: post.contentStyle,
      brandContext: brand.context,
    }),
  };
}

export async function getPostImageReviewState(post: PostDetail): Promise<PostImageReviewState> {
  const { direction } = await defaultDirection(post);
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const cookieStore = await cookies();
    const record = parseDemoImageRecords(cookieStore.get(DEMO_IMAGE_COOKIE)?.value).find(
      (item) => item.postDraftId === post.id && item.postVersionId === post.currentVersion.id,
    );
    return record ? demoState(record) : pendingState(post, direction);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("image_assets")
    .select(
      "id,post_version_id,concept_key,concept_direction,template,validation,base_image_path,final_image_path,status,model,prompt,prompt_version,provider_response_id,metadata,created_at",
    )
    .eq("post_draft_id", post.id)
    .eq("post_version_id", post.currentVersion.id)
    .in("status", ["ready", "validation_required"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Unable to load the post image.");
  return data
    ? persistentState(persistentImageRowSchema.parse(data))
    : pendingState(post, direction);
}

export async function performPostImageAction(input: {
  actorId: string;
  organizationId: string;
  post: PostDetail;
  request: ImageReviewActionRequest;
}) {
  const request = imageReviewActionRequestSchema.parse(input.request);
  if (request.expectedVersionId !== input.post.currentVersion.id) {
    throw new Error("The post changed before the image action completed.");
  }
  const { brand, direction: fallbackDirection } = await defaultDirection(input.post);
  const current = await getPostImageReviewState(input.post);
  const regeneratedDirection =
    request.action === "regenerate_concept"
      ? createReviewImageDirection({
          directionSeed: `${input.post.currentVersion.id}:${request.idempotencyKey}`,
          postText: input.post.currentVersion.content.fullText,
          valueNucleus: input.post.valueNucleus,
          contentStyle: input.post.contentStyle,
          brandContext: brand.context,
        })
      : (current.direction ?? fallbackDirection);
  const direction = selectImageConcept(
    regeneratedDirection,
    ["generate", "select_concept"].includes(request.action) ? request.conceptKey : undefined,
  );
  const selected = direction.concepts.find(
    (concept) => concept.conceptKey === direction.selectedConceptKey,
  )!;
  const template =
    ["generate", "change_template"].includes(request.action) && request.template
      ? imageTemplateSchema.parse(request.template)
      : current.status === "concept_pending"
        ? templateForStyle(selected.imageStyle)
        : current.template;
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") {
    const result = await generateWorkflowImage({
      contractVersion: "1.0",
      actorId: input.actorId,
      brandId: input.post.brandId,
      correlationId: uuidFromDeterministicHash(
        sha256Hex(`correlation:${input.organizationId}:${request.idempotencyKey}`),
      ),
      idempotencyKey: request.idempotencyKey,
      requestedAt: new Date().toISOString(),
      postDraftId: input.post.id,
      expectedVersionId: input.post.currentVersion.id,
      action: request.action === "select_concept" ? "regenerate_base" : request.action,
      imageStyle: selected.imageStyle,
      template,
      conceptKey: direction.selectedConceptKey,
    });
    return imageReviewActionResultSchema.parse({
      contractVersion: "1.0",
      postDraftId: input.post.id,
      postVersionId: input.post.currentVersion.id,
      imageAssetId: result.imageAssetId,
      selectedConceptKey: direction.selectedConceptKey,
      template,
      status: result.status,
      duplicate: result.duplicate,
    });
  }

  const baseSeed =
    request.action === "change_template" && current.status === "ready"
      ? (parseDemoImageRecords((await cookies()).get(DEMO_IMAGE_COOKIE)?.value).find(
          (record) => record.imageAssetId === current.imageAssetId,
        )?.baseSeed ?? request.idempotencyKey)
      : request.idempotencyKey;
  const artifact = await renderReviewImage({
    direction,
    selectedConceptKey: direction.selectedConceptKey,
    template,
    baseSeed,
    headline: input.post.currentVersion.content.hook,
    sourceLabel: input.post.sourceTitle,
    brandContext: brand.context,
  });

  const identitySeed = sha256Hex(
    `${input.organizationId}:${input.post.id}:${request.idempotencyKey}`,
  );
  const imageAssetId = uuidFromDeterministicHash(identitySeed);

  const cookieStore = await cookies();
  const records = parseDemoImageRecords(cookieStore.get(DEMO_IMAGE_COOKIE)?.value);
  const duplicate = records.some((record) => record.imageAssetId === imageAssetId);
  if (!duplicate) {
    const record: DemoImageRecord = {
      postDraftId: input.post.id,
      postVersionId: input.post.currentVersion.id,
      imageAssetId,
      imageDirection: artifact.direction,
      selectedConceptKey: artifact.direction.selectedConceptKey,
      template,
      baseSeed,
      validation: artifact.validation,
      model: artifact.generated.model,
      promptVersion: artifact.generated.promptVersion,
      providerResponseId: artifact.generated.providerResponseId,
      estimatedCostUsd: artifact.generated.usage.estimatedCostUsd,
      createdAt: new Date().toISOString(),
    };
    cookieStore.set(
      DEMO_IMAGE_COOKIE,
      serializeDemoImageRecords([
        record,
        ...records.filter((item) => item.postDraftId !== input.post.id),
      ]),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 8,
      },
    );
  }
  return imageReviewActionResultSchema.parse({
    contractVersion: "1.0",
    postDraftId: input.post.id,
    postVersionId: input.post.currentVersion.id,
    imageAssetId,
    selectedConceptKey: artifact.direction.selectedConceptKey,
    template,
    status: "ready",
    duplicate,
  });
}

export async function getPostFinalImageBytes(post: PostDetail) {
  const state = await getPostImageReviewState(post);
  if (state.status !== "ready" || !state.imageAssetId) return null;
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const cookieStore = await cookies();
    const record = parseDemoImageRecords(cookieStore.get(DEMO_IMAGE_COOKIE)?.value).find(
      (item) => item.imageAssetId === state.imageAssetId,
    );
    if (!record) return null;
    const brand = await getBrandConfiguration(post.brandId);
    if (!brand) return null;
    const artifact = await renderReviewImage({
      direction: record.imageDirection,
      selectedConceptKey: record.selectedConceptKey,
      template: record.template,
      baseSeed: record.baseSeed,
      headline: post.currentVersion.content.hook,
      sourceLabel: post.sourceTitle,
      brandContext: brand.context,
    });
    return { bytes: artifact.finalImage, state };
  }
  if (!state.finalImagePath) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from("generated-images")
    .download(state.finalImagePath);
  if (error) throw new Error("The final image could not be downloaded.");
  return { bytes: Buffer.from(await data.arrayBuffer()), state };
}
