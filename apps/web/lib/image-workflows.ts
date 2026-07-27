import "server-only";
import {
  FakeImageProvider,
  ImageProviderError,
  OpenAIImageProvider,
  type ImageProvider,
} from "@content-engine/ai/image";
import {
  generatedImageSchema,
  imageDirectionSchema,
  imageGenerationResultSchema,
  imageValidationSchema,
  imageWorkflowRequestSchema,
  serverEnvSchema,
  type ImageWorkflowRequest,
} from "@content-engine/contracts";
import { z } from "zod";
import { getBrandConfigurationForWorkflow } from "./brand-configuration";
import { executeImageWorkflow } from "./image-workflow-core";
import { SupabaseImageAssetPersistencePort } from "./image-asset-supabase";
import { themeFromBrandContext } from "./image-review-core";
import { createSupabaseServiceClient } from "./supabase/service";

export class ImageWorkflowError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ImageWorkflowError";
  }
}

const draftSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  brand_id: z.uuid(),
  opportunity_id: z.uuid(),
  current_version_id: z.uuid().nullable(),
  content_style: z.string().min(1),
  status: z.string().min(1),
  score_breakdown: z.unknown(),
});

const versionSchema = z.object({
  id: z.uuid(),
  hook: z.string().min(1),
  full_text: z.string().min(20),
});

const opportunitySchema = z.object({
  value_nucleus: z.string().min(20),
  source_documents: z
    .union([
      z.object({ title: z.string().min(1) }),
      z.array(z.object({ title: z.string().min(1) })),
    ])
    .nullable(),
});

const existingImageSchema = z.object({
  concept_key: z.string().regex(/^concept_[a-z0-9]{6,40}$/),
  concept_direction: imageDirectionSchema,
  base_image_path: z.string().min(1),
  validation: imageValidationSchema,
  model: z.string().min(1),
  provider_response_id: z.string().min(1),
  prompt_version: z.string().min(1),
});

function sourceTitle(value: z.infer<typeof opportunitySchema>["source_documents"]) {
  if (Array.isArray(value)) return value[0]?.title ?? "Original input";
  return value?.title ?? "Original input";
}

async function assertWorkflowEditor(input: {
  actorId: string;
  brandId: string;
  organizationId: string;
}) {
  const supabase = createSupabaseServiceClient();
  const [organization, brand] = await Promise.all([
    supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", input.organizationId)
      .eq("user_id", input.actorId)
      .maybeSingle(),
    supabase
      .from("brand_members")
      .select("role")
      .eq("brand_id", input.brandId)
      .eq("user_id", input.actorId)
      .maybeSingle(),
  ]);
  if (organization.error ?? brand.error) {
    throw new ImageWorkflowError(
      "authorization_lookup_failed",
      "Image workflow authorization could not be checked.",
      500,
    );
  }
  const allowed =
    organization.data?.role === "administrator" ||
    ["administrator", "editor"].includes(brand.data?.role ?? "");
  if (!organization.data || !allowed) {
    throw new ImageWorkflowError(
      "editor_role_required",
      "The workflow actor is not an editor for this brand.",
      403,
    );
  }
}

function createProvider(brandContext: Parameters<typeof themeFromBrandContext>[0]): ImageProvider {
  const env = serverEnvSchema.parse(process.env);
  if (env.AI_PROVIDER === "fake") {
    return new FakeImageProvider(themeFromBrandContext(brandContext));
  }
  if (!env.OPENAI_API_KEY) {
    throw new ImageWorkflowError(
      "openai_key_required",
      "Production image generation requires a server-side OpenAI API key.",
      503,
    );
  }
  if (!env.AI_IMAGE_EVAL_BASELINE_ID) {
    throw new ImageWorkflowError(
      "image_baseline_required",
      "Production image generation requires an accepted image evaluation baseline.",
      503,
    );
  }
  if (env.AI_IMAGE_COST_USD_PER_IMAGE <= 0) {
    throw new ImageWorkflowError(
      "image_price_required",
      "Production image generation requires an approved positive per-image price.",
      503,
    );
  }
  return new OpenAIImageProvider({
    apiKey: env.OPENAI_API_KEY,
    model: env.AI_MODEL_IMAGE,
    quality: env.AI_IMAGE_QUALITY,
    size: env.AI_IMAGE_SIZE,
    timeoutMs: env.AI_IMAGE_TIMEOUT_MS,
    maxRetries: env.AI_PROVIDER_MAX_RETRIES,
    approvedCostUsdPerImage: env.AI_IMAGE_COST_USD_PER_IMAGE,
    maxCostUsd: env.AI_IMAGE_PER_RUN_BUDGET_USD,
    evaluationBaselineId: env.AI_IMAGE_EVAL_BASELINE_ID,
  });
}

export async function generateWorkflowImage(rawInput: ImageWorkflowRequest) {
  const input = imageWorkflowRequestSchema.parse(rawInput);
  const supabase = createSupabaseServiceClient();
  const { data: rawDraft, error: draftError } = await supabase
    .from("post_drafts")
    .select(
      "id,organization_id,brand_id,opportunity_id,current_version_id,content_style,status,score_breakdown",
    )
    .eq("id", input.postDraftId)
    .eq("brand_id", input.brandId)
    .maybeSingle();
  if (draftError) {
    throw new ImageWorkflowError("post_lookup_failed", "The post could not be loaded.", 500);
  }
  if (!rawDraft) {
    throw new ImageWorkflowError("post_not_found", "The post was not found for this brand.", 404);
  }
  const draft = draftSchema.parse(rawDraft);
  if (draft.current_version_id !== input.expectedVersionId) {
    throw new ImageWorkflowError(
      "post_version_changed",
      "The post changed before image generation started.",
      409,
    );
  }
  const evaluation = z
    .object({ evaluation: z.object({ readyForReview: z.literal(true) }) })
    .safeParse(draft.score_breakdown);
  if (draft.status !== "ready_for_review" || !evaluation.success) {
    throw new ImageWorkflowError(
      "post_not_ready",
      "The post must pass editorial verification before image generation.",
      409,
    );
  }

  const [versionResult, opportunityResult, brand] = await Promise.all([
    supabase
      .from("post_versions")
      .select("id,hook,full_text")
      .eq("id", input.expectedVersionId)
      .eq("post_draft_id", input.postDraftId)
      .maybeSingle(),
    supabase
      .from("opportunities")
      .select("value_nucleus,source_documents(title)")
      .eq("id", draft.opportunity_id)
      .maybeSingle(),
    getBrandConfigurationForWorkflow(input.brandId),
    assertWorkflowEditor({
      actorId: input.actorId,
      brandId: input.brandId,
      organizationId: draft.organization_id,
    }),
  ]);
  if (versionResult.error ?? opportunityResult.error) {
    throw new ImageWorkflowError(
      "image_context_failed",
      "The image workflow context could not be loaded.",
      500,
    );
  }
  if (!versionResult.data || !opportunityResult.data || !brand) {
    throw new ImageWorkflowError(
      "image_context_missing",
      "The post, opportunity, or brand image context is incomplete.",
      409,
    );
  }
  const version = versionSchema.parse(versionResult.data);
  const opportunity = opportunitySchema.parse(opportunityResult.data);
  let existingImage: z.infer<typeof existingImageSchema> | undefined;
  if (["regenerate_base", "change_template"].includes(input.action)) {
    const { data, error } = await supabase
      .from("image_assets")
      .select(
        "concept_key,concept_direction,base_image_path,validation,model,provider_response_id,prompt_version",
      )
      .eq("post_draft_id", input.postDraftId)
      .eq("post_version_id", input.expectedVersionId)
      .in("status", ["ready", "validation_required"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new ImageWorkflowError(
        "image_lookup_failed",
        "The current image could not be loaded.",
        500,
      );
    }
    if (!data) {
      throw new ImageWorkflowError(
        "image_not_found",
        "A current image is required for this selective action.",
        409,
      );
    }
    existingImage = existingImageSchema.parse(data);
  }
  const effectiveInput = imageWorkflowRequestSchema.parse({
    ...input,
    conceptKey: input.conceptKey ?? existingImage?.concept_key,
  });
  let provider: ImageProvider;
  if (input.action === "change_template" && existingImage) {
    const { data, error } = await supabase.storage
      .from("generated-images")
      .download(existingImage.base_image_path);
    if (error) {
      throw new ImageWorkflowError(
        "base_image_unavailable",
        "The current base image could not be read.",
        500,
      );
    }
    const imageBase64 = Buffer.from(await data.arrayBuffer()).toString("base64");
    const existing = existingImage;
    provider = {
      async generate() {
        return generatedImageSchema.parse({
          contractVersion: "1.0",
          imageBase64,
          mimeType: existing.validation.mimeType,
          width: existing.validation.width,
          height: existing.validation.height,
          model: existing.model,
          providerResponseId: existing.provider_response_id,
          promptVersion: existing.prompt_version,
          usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
        });
      },
    };
  } else {
    provider = createProvider(brand.context);
  }
  try {
    return imageGenerationResultSchema.parse(
      await executeImageWorkflow(
        effectiveInput,
        {
          post: {
            id: draft.id,
            brandId: draft.brand_id,
            organizationId: draft.organization_id,
            currentVersionId: version.id,
            contentStyle: draft.content_style,
            hook: version.hook,
            fullText: version.full_text,
            sourceTitle: sourceTitle(opportunity.source_documents),
            valueNucleus: opportunity.value_nucleus,
          },
          brandContext: brand.context,
          existingDirection: existingImage?.concept_direction,
        },
        {
          provider,
          persistence: new SupabaseImageAssetPersistencePort(),
        },
      ),
    );
  } catch (error) {
    if (error instanceof ImageProviderError) {
      throw new ImageWorkflowError(
        error.code,
        error.message,
        error.code === "budget_exceeded" ? 422 : error.retryable ? 503 : 502,
      );
    }
    throw error;
  }
}
