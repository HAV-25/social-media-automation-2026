import {
  createImageDirection,
  FakeImageProvider,
  type ImageProviderRequest,
} from "@content-engine/ai";
import type { NormalizedBrandContext } from "@content-engine/brand-memory";
import {
  imageDirectionSchema,
  imageTemplateSchema,
  type ImageDirection,
  type ImageStyle,
  type ImageTemplate,
} from "@content-engine/contracts";
import {
  composeBrandedImage,
  validateBaseImage,
  type BrandImageTheme,
} from "@content-engine/image-compositor";

export function preferredImageStyle(contentStyle: string): ImageStyle {
  switch (contentStyle) {
    case "educational_breakdown":
      return "insight_card";
    case "perspective_conversation":
      return "conceptual_illustration";
    default:
      return "editorial_hero";
  }
}

export function templateForStyle(style: ImageStyle): ImageTemplate {
  return {
    editorial_hero: "editorial_overlay",
    insight_card: "insight_split",
    conceptual_illustration: "concept_frame",
    branded_headline_card: "headline_panel",
  }[style] as ImageTemplate;
}

export function themeFromBrandContext(context: NormalizedBrandContext): BrandImageTheme {
  const colors = context.visualAssets
    .flatMap((asset) => asset.dominantColors)
    .filter((color) => /^#[0-9a-f]{6}$/i.test(color));
  return {
    brandName: context.identity.name,
    primaryColor: colors[0] ?? "#10243E",
    secondaryColor: colors[1] ?? "#315B63",
    accentColor: colors[2] ?? "#F5B942",
    preferredTextColor: "#FFFFFF",
  };
}

export function createReviewImageDirection(input: {
  directionSeed: string;
  postText: string;
  valueNucleus: string;
  contentStyle: string;
  brandContext: NormalizedBrandContext;
}) {
  return createImageDirection({
    postDraftId: input.directionSeed,
    postText: input.postText,
    valueNucleus: input.valueNucleus,
    preferredStyle: preferredImageStyle(input.contentStyle),
    brandContext: input.brandContext,
  });
}

export function selectImageConcept(direction: ImageDirection, conceptKey?: string) {
  const selectedConceptKey = conceptKey ?? direction.selectedConceptKey;
  if (!direction.concepts.some((concept) => concept.conceptKey === selectedConceptKey)) {
    throw new Error("The selected image concept is not available.");
  }
  return imageDirectionSchema.parse({ ...direction, selectedConceptKey });
}

export async function renderReviewImage(input: {
  direction: ImageDirection;
  selectedConceptKey: string;
  template: ImageTemplate;
  baseSeed: string;
  headline: string;
  sourceLabel: string;
  brandContext: NormalizedBrandContext;
}) {
  const direction = selectImageConcept(input.direction, input.selectedConceptKey);
  const concept = direction.concepts.find(
    (candidate) => candidate.conceptKey === direction.selectedConceptKey,
  )!;
  const template = imageTemplateSchema.parse(input.template);
  const provider = new FakeImageProvider(themeFromBrandContext(input.brandContext));
  const generated = await provider.generate({
    concept,
    idempotencyKey: input.baseSeed,
  } satisfies ImageProviderRequest);
  const baseImage = Buffer.from(generated.imageBase64, "base64");
  const validation = await validateBaseImage(baseImage);
  if (!validation.readyForComposition || validation.humanOverrideRequired) {
    throw new Error("The generated base image requires validation before composition.");
  }
  const composition = await composeBrandedImage({
    baseImage,
    template,
    headline: concept.headlineOverlay || input.headline,
    sourceLabel: input.sourceLabel,
    theme: themeFromBrandContext(input.brandContext),
  });
  return {
    direction,
    concept,
    template,
    generated,
    baseImage,
    validation,
    finalImage: composition.image,
    composition,
  };
}
