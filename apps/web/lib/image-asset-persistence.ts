import {
  generatedImageSchema,
  imageAssetPersistenceResultSchema,
  imageDirectionSchema,
  imageTemplateSchema,
  imageValidationOverrideResultSchema,
  imageValidationSchema,
  type GeneratedImage,
  type ImageAssetPersistenceResult,
  type ImageDirection,
  type ImageTemplate,
  type ImageValidation,
  type ImageValidationOverrideResult,
} from "@content-engine/contracts";
import { sha256Hex } from "@content-engine/security";
import { createHash } from "node:crypto";
import { z } from "zod";

const identifiersSchema = z
  .object({
    actorId: z.uuid(),
    organizationId: z.uuid(),
    brandId: z.uuid(),
    postDraftId: z.uuid(),
    postVersionId: z.uuid(),
    imageAssetId: z.uuid(),
    correlationId: z.uuid(),
    idempotencyKey: z.string().trim().min(16).max(200),
  })
  .strict();

export type ImageStoragePaths = {
  baseImagePath: string;
  finalImagePath: string;
};

export function buildGeneratedImagePaths(input: {
  organizationId: string;
  brandId: string;
  postDraftId: string;
  imageAssetId: string;
}): ImageStoragePaths {
  const schema = z
    .object({
      organizationId: z.uuid(),
      brandId: z.uuid(),
      postDraftId: z.uuid(),
      imageAssetId: z.uuid(),
    })
    .strict();
  const identifiers = schema.parse({
    organizationId: input.organizationId,
    brandId: input.brandId,
    postDraftId: input.postDraftId,
    imageAssetId: input.imageAssetId,
  });
  const prefix = [
    identifiers.organizationId,
    identifiers.brandId,
    identifiers.postDraftId,
    identifiers.imageAssetId,
  ].join("/");
  return {
    baseImagePath: `${prefix}/base.png`,
    finalImagePath: `${prefix}/final.png`,
  };
}

export type ImageObjectUploadState = "uploaded" | "exists";

export interface ImageAssetPersistencePort {
  upload(path: string, bytes: Buffer): Promise<ImageObjectUploadState>;
  remove(paths: string[]): Promise<void>;
  persist(payload: Record<string, unknown>): Promise<unknown>;
  persistOverride(payload: Record<string, unknown>): Promise<unknown>;
}

export type PersistGeneratedImageInput = z.infer<typeof identifiersSchema> & {
  imageDirection: ImageDirection;
  selectedConceptKey: string;
  template: ImageTemplate;
  validation: ImageValidation;
  baseImage: Buffer;
  finalImage?: Buffer;
  provider: GeneratedImage;
  prompt: string;
};

const persistenceRpcRowSchema = z
  .object({
    image_asset_id: z.uuid(),
    generation_run_id: z.uuid(),
    duplicate: z.boolean(),
    asset_status: z.enum(["validation_required", "ready"]),
  })
  .strict();

const overrideRpcRowSchema = z
  .object({
    image_asset_id: z.uuid(),
    generation_run_id: z.uuid(),
    duplicate: z.boolean(),
    asset_status: z.literal("ready"),
  })
  .strict();

function resolvePersistenceState(input: { validation: ImageValidation; finalImage?: Buffer }) {
  if (
    input.validation.readyForComposition &&
    !input.validation.humanOverrideRequired &&
    input.finalImage
  ) {
    return "ready" as const;
  }
  if (
    !input.validation.readyForComposition &&
    input.validation.humanOverrideRequired &&
    !input.finalImage
  ) {
    return "validation_required" as const;
  }
  throw new Error("Image bytes and validation state are inconsistent.");
}

function checksum(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function persistGeneratedImage(
  rawInput: PersistGeneratedImageInput,
  port: ImageAssetPersistencePort,
): Promise<ImageAssetPersistenceResult> {
  const identifiers = identifiersSchema.parse({
    actorId: rawInput.actorId,
    organizationId: rawInput.organizationId,
    brandId: rawInput.brandId,
    postDraftId: rawInput.postDraftId,
    postVersionId: rawInput.postVersionId,
    imageAssetId: rawInput.imageAssetId,
    correlationId: rawInput.correlationId,
    idempotencyKey: rawInput.idempotencyKey,
  });
  const direction = imageDirectionSchema.parse(rawInput.imageDirection);
  const validation = imageValidationSchema.parse(rawInput.validation);
  const provider = generatedImageSchema.parse(rawInput.provider);
  const template = imageTemplateSchema.parse(rawInput.template);
  const selected = direction.concepts.find(
    (concept) => concept.conceptKey === rawInput.selectedConceptKey,
  );
  if (!selected || direction.selectedConceptKey !== selected.conceptKey) {
    throw new Error("The selected image concept is not the directed concept.");
  }
  const status = resolvePersistenceState({
    validation,
    finalImage: rawInput.finalImage,
  });
  const paths = buildGeneratedImagePaths(identifiers);
  const baseChecksum = checksum(rawInput.baseImage);
  const finalChecksum = rawInput.finalImage ? checksum(rawInput.finalImage) : null;
  const requestHash = sha256Hex(
    JSON.stringify({
      ...identifiers,
      imageDirection: direction,
      selectedConceptKey: selected.conceptKey,
      template,
      validation,
      provider: {
        model: provider.model,
        providerResponseId: provider.providerResponseId,
        promptVersion: provider.promptVersion,
        usage: provider.usage,
      },
      baseChecksum,
      finalChecksum,
    }),
  );
  const payload: Record<string, unknown> = {
    ...identifiers,
    requestHash,
    status,
    imageStyle: selected.imageStyle,
    template,
    imageDirection: direction,
    selectedConceptKey: selected.conceptKey,
    prompt: rawInput.prompt,
    baseImagePath: paths.baseImagePath,
    finalImagePath: status === "ready" ? paths.finalImagePath : null,
    baseChecksum,
    finalChecksum,
    dimensions:
      status === "ready"
        ? { width: 1200, height: 630 }
        : { width: validation.width, height: validation.height },
    validation,
    model: provider.model,
    promptVersion: provider.promptVersion,
    providerResponseId: provider.providerResponseId,
    modelRecord: {
      model: provider.model,
      promptVersion: provider.promptVersion,
      responseId: provider.providerResponseId,
      usage: provider.usage,
      costUsd: provider.usage.estimatedCostUsd,
    },
  };

  const newlyUploaded: string[] = [];
  try {
    if ((await port.upload(paths.baseImagePath, rawInput.baseImage)) === "uploaded") {
      newlyUploaded.push(paths.baseImagePath);
    }
    if (
      status === "ready" &&
      rawInput.finalImage &&
      (await port.upload(paths.finalImagePath, rawInput.finalImage)) === "uploaded"
    ) {
      newlyUploaded.push(paths.finalImagePath);
    }
    const row = persistenceRpcRowSchema.parse(await port.persist(payload));
    return imageAssetPersistenceResultSchema.parse({
      contractVersion: "1.0",
      imageAssetId: row.image_asset_id,
      generationRunId: row.generation_run_id,
      status: row.asset_status,
      baseImagePath: paths.baseImagePath,
      finalImagePath: row.asset_status === "ready" ? paths.finalImagePath : null,
      duplicate: row.duplicate,
    });
  } catch (error) {
    if (newlyUploaded.length) await port.remove(newlyUploaded);
    throw error;
  }
}

export type PersistImageOverrideInput = {
  actorId: string;
  organizationId: string;
  brandId: string;
  postDraftId: string;
  imageAssetId: string;
  correlationId: string;
  idempotencyKey: string;
  reason: string;
  finalImage: Buffer;
};

export async function persistImageValidationOverride(
  rawInput: PersistImageOverrideInput,
  port: ImageAssetPersistencePort,
): Promise<ImageValidationOverrideResult> {
  const input = z
    .object({
      actorId: z.uuid(),
      organizationId: z.uuid(),
      brandId: z.uuid(),
      postDraftId: z.uuid(),
      imageAssetId: z.uuid(),
      correlationId: z.uuid(),
      idempotencyKey: z.string().trim().min(16).max(200),
      reason: z.string().trim().min(10).max(2_000),
      finalImage: z.instanceof(Buffer),
    })
    .strict()
    .parse(rawInput);
  const paths = buildGeneratedImagePaths({
    organizationId: input.organizationId,
    brandId: input.brandId,
    postDraftId: input.postDraftId,
    imageAssetId: input.imageAssetId,
  });
  const finalChecksum = checksum(input.finalImage);
  const requestHash = sha256Hex(
    JSON.stringify({
      actorId: input.actorId,
      organizationId: input.organizationId,
      brandId: input.brandId,
      postDraftId: input.postDraftId,
      imageAssetId: input.imageAssetId,
      reason: input.reason,
      finalChecksum,
    }),
  );
  let uploaded = false;
  try {
    uploaded = (await port.upload(paths.finalImagePath, input.finalImage)) === "uploaded";
    const row = overrideRpcRowSchema.parse(
      await port.persistOverride({
        actorId: input.actorId,
        imageAssetId: input.imageAssetId,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        reason: input.reason,
        finalImagePath: paths.finalImagePath,
        finalChecksum,
      }),
    );
    return imageValidationOverrideResultSchema.parse({
      contractVersion: "1.0",
      imageAssetId: row.image_asset_id,
      generationRunId: row.generation_run_id,
      status: row.asset_status,
      finalImagePath: paths.finalImagePath,
      duplicate: row.duplicate,
    });
  } catch (error) {
    if (uploaded) await port.remove([paths.finalImagePath]);
    throw error;
  }
}
