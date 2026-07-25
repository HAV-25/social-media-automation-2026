import {
  generatedImageSchema,
  imageDirectionSchema,
  imageValidationSchema,
} from "@content-engine/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  buildGeneratedImagePaths,
  persistGeneratedImage,
  persistImageValidationOverride,
  type ImageAssetPersistencePort,
} from "./image-asset-persistence";

const ids = {
  actorId: "40000000-0000-4000-8000-000000000002",
  organizationId: "10000000-0000-4000-8000-000000000001",
  brandId: "20000000-0000-4000-8000-000000000001",
  postDraftId: "60000000-0000-4000-8000-000000000001",
  postVersionId: "61000000-0000-4000-8000-000000000001",
  imageAssetId: "62000000-0000-4000-8000-000000000001",
  correlationId: "63000000-0000-4000-8000-000000000001",
  idempotencyKey: "image-persistence-0001",
};

const concepts = [1, 2, 3].map((rank) => ({
  conceptKey: `concept_fixture${rank}`,
  title: `Concept ${rank}`,
  visualNucleus: `A bounded visual nucleus for deterministic concept number ${rank}.`,
  imageStyle:
    rank === 1
      ? ("editorial_hero" as const)
      : rank === 2
        ? ("conceptual_illustration" as const)
        : ("branded_headline_card" as const),
  literalOrConceptual: rank === 1 ? ("literal" as const) : ("conceptual" as const),
  composition: `A materially different editorial composition with safe space, version ${rank}.`,
  palette: ["#10243E", "#F5B942"],
  avoid: ["generated text"],
  headlineOverlay: "Evidence before interpretation",
  sourceLabel: "Internal editorial",
  rank,
  score: 95 - rank,
  rankExplanation: `This rank has a deterministic and sufficiently detailed explanation ${rank}.`,
}));

const direction = imageDirectionSchema.parse({
  contractVersion: "1.0",
  concepts,
  selectedConceptKey: "concept_fixture1",
});

const provider = generatedImageSchema.parse({
  contractVersion: "1.0",
  imageBase64: Buffer.from("provider image fixture".repeat(20)).toString("base64"),
  mimeType: "image/png",
  width: 1536,
  height: 1024,
  model: "fake-image-v1",
  providerResponseId: "fake_provider_response_1",
  promptVersion: "image-director.v1",
  usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
});

function validation(overrides: Record<string, unknown> = {}) {
  return imageValidationSchema.parse({
    contractVersion: "1.0",
    width: 1536,
    height: 1024,
    mimeType: "image/png",
    byteLength: 2048,
    aspectRatio: 1.5,
    hasSufficientOverlayContrast: true,
    focalSafeAreaClear: true,
    generatedTextDetected: false,
    unsafeImageryDetected: false,
    misleadingRepresentationRisk: "low",
    warnings: [],
    readyForComposition: true,
    humanOverrideRequired: false,
    ...overrides,
  });
}

function port(overrides: Partial<ImageAssetPersistencePort> = {}) {
  return {
    upload: vi.fn(async () => "uploaded" as const),
    remove: vi.fn(async () => undefined),
    persist: vi.fn(async () => ({
      image_asset_id: ids.imageAssetId,
      generation_run_id: "64000000-0000-4000-8000-000000000001",
      duplicate: false,
      asset_status: "ready",
    })),
    persistOverride: vi.fn(async () => ({
      image_asset_id: ids.imageAssetId,
      generation_run_id: "64000000-0000-4000-8000-000000000002",
      duplicate: false,
      asset_status: "ready",
    })),
    ...overrides,
  } satisfies ImageAssetPersistencePort;
}

describe("private image asset persistence", () => {
  it("builds immutable organization/brand/post/asset storage paths", () => {
    expect(buildGeneratedImagePaths(ids)).toEqual({
      baseImagePath:
        "10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001/62000000-0000-4000-8000-000000000001/base.png",
      finalImagePath:
        "10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001/62000000-0000-4000-8000-000000000001/final.png",
    });
  });

  it("stores base and final bytes before one atomic ready-state persistence call", async () => {
    const persistence = port();
    const result = await persistGeneratedImage(
      {
        ...ids,
        imageDirection: direction,
        selectedConceptKey: direction.selectedConceptKey,
        template: "editorial_overlay",
        validation: validation(),
        baseImage: Buffer.from("base-image"),
        finalImage: Buffer.from("final-image"),
        provider,
        prompt: "Text-free editorial base artwork.",
      },
      persistence,
    );

    expect(persistence.upload).toHaveBeenCalledTimes(2);
    expect(persistence.persist).toHaveBeenCalledTimes(1);
    expect(persistence.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ready",
        imageStyle: "editorial_hero",
        template: "editorial_overlay",
        baseChecksum: expect.stringMatching(/^[0-9a-f]{64}$/),
        finalChecksum: expect.stringMatching(/^[0-9a-f]{64}$/),
        dimensions: { width: 1200, height: 630 },
      }),
    );
    expect(result.status).toBe("ready");
    expect(result.finalImagePath).toMatch(/\/final\.png$/);
  });

  it("stores only the canonical base when validation requires human review", async () => {
    const persistence = port({
      persist: vi.fn(async () => ({
        image_asset_id: ids.imageAssetId,
        generation_run_id: "64000000-0000-4000-8000-000000000001",
        duplicate: false,
        asset_status: "validation_required",
      })),
    });
    const result = await persistGeneratedImage(
      {
        ...ids,
        imageDirection: direction,
        selectedConceptKey: direction.selectedConceptKey,
        template: "editorial_overlay",
        validation: validation({
          generatedTextDetected: true,
          warnings: ["Generated text was detected."],
          readyForComposition: false,
          humanOverrideRequired: true,
        }),
        baseImage: Buffer.from("unsafe-base-image"),
        provider,
        prompt: "Text-free editorial base artwork.",
      },
      persistence,
    );

    expect(persistence.upload).toHaveBeenCalledTimes(1);
    expect(persistence.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "validation_required",
        finalImagePath: null,
        finalChecksum: null,
      }),
    );
    expect(result).toMatchObject({
      status: "validation_required",
      finalImagePath: null,
    });
  });

  it("removes only newly uploaded objects when the database transaction fails", async () => {
    const persistence = port({
      upload: vi
        .fn<ImageAssetPersistencePort["upload"]>()
        .mockResolvedValueOnce("exists")
        .mockResolvedValueOnce("uploaded"),
      persist: vi.fn(async () => {
        throw new Error("database failure");
      }),
    });

    await expect(
      persistGeneratedImage(
        {
          ...ids,
          imageDirection: direction,
          selectedConceptKey: direction.selectedConceptKey,
          template: "editorial_overlay",
          validation: validation(),
          baseImage: Buffer.from("base-image"),
          finalImage: Buffer.from("final-image"),
          provider,
          prompt: "Text-free editorial base artwork.",
        },
        persistence,
      ),
    ).rejects.toThrow("database failure");
    expect(persistence.remove).toHaveBeenCalledWith([expect.stringMatching(/\/final\.png$/)]);
  });

  it("rejects contradictory validation and composition states before storage", async () => {
    const persistence = port();
    await expect(
      persistGeneratedImage(
        {
          ...ids,
          imageDirection: direction,
          selectedConceptKey: direction.selectedConceptKey,
          template: "editorial_overlay",
          validation: validation({ readyForComposition: false }),
          baseImage: Buffer.from("base-image"),
          provider,
          prompt: "Text-free editorial base artwork.",
        },
        persistence,
      ),
    ).rejects.toThrow("inconsistent");
    expect(persistence.upload).not.toHaveBeenCalled();
  });

  it("uploads the composed override and persists the reviewer reason atomically", async () => {
    const persistence = port();
    const result = await persistImageValidationOverride(
      {
        actorId: ids.actorId,
        organizationId: ids.organizationId,
        brandId: ids.brandId,
        postDraftId: ids.postDraftId,
        imageAssetId: ids.imageAssetId,
        correlationId: ids.correlationId,
        idempotencyKey: "image-override-0001",
        reason:
          "The reviewer confirmed the detected mark is an abstract shape, not generated text.",
        finalImage: Buffer.from("reviewed-final-image"),
      },
      persistence,
    );

    expect(persistence.upload).toHaveBeenCalledWith(
      expect.stringMatching(/\/final\.png$/),
      expect.any(Buffer),
    );
    expect(persistence.persistOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: expect.stringContaining("reviewer confirmed"),
        finalChecksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
    expect(result.status).toBe("ready");
  });
});
