import {
  buildImageGenerationPrompt,
  createImageDirection,
  sanitizeImageDisplayText,
  type ImageProvider,
  type ImageProviderRequest,
} from "@content-engine/ai/image";
import type { NormalizedBrandContext } from "@content-engine/brand-memory";
import {
  imageDirectionSchema,
  imageGenerationResultSchema,
  imageWorkflowRequestSchema,
  type ImageDirection,
  type ImageWorkflowRequest,
} from "@content-engine/contracts";
import { composeBrandedImage, validateBaseImage } from "@content-engine/image-compositor";
import { sha256Hex } from "@content-engine/security";
import { uuidFromDeterministicHash } from "./demo-content-store";
import { persistGeneratedImage, type ImageAssetPersistencePort } from "./image-asset-persistence";
import { themeFromBrandContext } from "./image-review-core";

export type WorkflowImagePost = {
  id: string;
  brandId: string;
  organizationId: string;
  currentVersionId: string;
  contentStyle: string;
  hook: string;
  fullText: string;
  sourceTitle: string;
  valueNucleus: string;
};

export async function executeImageWorkflow(
  rawRequest: ImageWorkflowRequest,
  context: {
    post: WorkflowImagePost;
    brandContext: NormalizedBrandContext;
    existingDirection?: ImageDirection;
  },
  dependencies: {
    provider: ImageProvider;
    persistence: ImageAssetPersistencePort;
  },
) {
  const request = imageWorkflowRequestSchema.parse(rawRequest);
  const direction = context.existingDirection
    ? imageDirectionSchema.parse(context.existingDirection)
    : createImageDirection({
        postDraftId:
          request.action === "regenerate_concept"
            ? `${request.expectedVersionId}:${request.idempotencyKey}`
            : request.expectedVersionId,
        postText: context.post.fullText,
        valueNucleus: context.post.valueNucleus,
        preferredStyle: request.imageStyle,
        brandContext: context.brandContext,
      });
  const selected =
    (request.conceptKey
      ? direction.concepts.find((concept) => concept.conceptKey === request.conceptKey)
      : direction.concepts.find((concept) => concept.imageStyle === request.imageStyle)) ??
    direction.concepts[0]!;
  if (request.conceptKey && selected.conceptKey !== request.conceptKey) {
    throw new Error("The requested image concept is not part of this deterministic direction.");
  }
  const selectedDirection = { ...direction, selectedConceptKey: selected.conceptKey };
  const generated = await dependencies.provider.generate({
    concept: selected,
    idempotencyKey: request.idempotencyKey,
    template: request.template,
  } satisfies ImageProviderRequest);
  const baseImage = Buffer.from(generated.imageBase64, "base64");
  const baseValidation = await validateBaseImage(baseImage);
  const composition =
    baseValidation.readyForComposition && !baseValidation.humanOverrideRequired
      ? await composeBrandedImage({
          baseImage,
          template: request.template,
          headline: sanitizeImageDisplayText(selected.headlineOverlay || context.post.hook, 200),
          sourceLabel: sanitizeImageDisplayText(
            selected.sourceLabel || context.post.sourceTitle,
            200,
          ),
          theme: themeFromBrandContext(context.brandContext),
        })
      : null;
  const validation = {
    ...baseValidation,
    warnings: [...baseValidation.warnings, ...(composition?.validation.warnings ?? [])],
    finalComposition: composition?.validation ?? null,
  };
  const finalImage = composition?.validation.readyForReview ? composition.image : undefined;
  const identityHash = sha256Hex(
    `${context.post.organizationId}:${context.post.id}:${request.idempotencyKey}`,
  );
  const persisted = await persistGeneratedImage(
    {
      actorId: request.actorId,
      organizationId: context.post.organizationId,
      brandId: context.post.brandId,
      postDraftId: context.post.id,
      postVersionId: context.post.currentVersionId,
      imageAssetId: uuidFromDeterministicHash(identityHash),
      correlationId: request.correlationId,
      idempotencyKey: request.idempotencyKey,
      imageDirection: selectedDirection,
      selectedConceptKey: selected.conceptKey,
      template: request.template,
      validation,
      baseImage,
      finalImage,
      provider: generated,
      prompt: buildImageGenerationPrompt(selected, request.template),
    },
    dependencies.persistence,
  );
  return imageGenerationResultSchema.parse({
    contractVersion: "1.0",
    imageAssetId: persisted.imageAssetId,
    postDraftId: context.post.id,
    baseImagePath: persisted.baseImagePath,
    finalImagePath: persisted.finalImagePath,
    status: persisted.status,
    duplicate: persisted.duplicate,
  });
}
