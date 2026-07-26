"use server";

import {
  FakeEmbeddingProvider,
  OpenAIEmbeddingProvider,
  brandAssetMetadataSchema,
  brandExampleInputSchema,
  brandProfileInputSchema,
  opportunitySelectionPolicySchema,
  validateBrandAssetBytes,
} from "@content-engine/brand-memory";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDemoBrandRecord } from "@/lib/demo-brand-memory";
import { canManageBrand, canManageOrganization } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEMO_OVERRIDE_PREFIX = "brand-memory-demo-";

function list(value: FormDataEntryValue | null) {
  return [
    ...new Set(
      String(value ?? "")
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function numberValue(value: FormDataEntryValue | null) {
  return Number(String(value ?? ""));
}

function formError(brandId: string, message: string): never {
  redirect(`/brands/${brandId}?error=${encodeURIComponent(message)}`);
}

async function requireAuthorizedBrand(brandId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!canManageBrand(user.role)) formError(brandId, "Your role cannot modify brand settings.");

  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("brands")
      .select("id,organization_id")
      .eq("id", brandId)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (error || !data) formError(brandId, "Brand not found or not assigned to this account.");
  } else if (!getDemoBrandRecord(brandId)) {
    formError(brandId, "Brand not found or not assigned to this account.");
  }

  return user;
}

function profileFromForm(formData: FormData) {
  return brandProfileInputSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    description: String(formData.get("description") ?? ""),
    website: String(formData.get("website") ?? ""),
    defaultLanguage: String(formData.get("defaultLanguage") ?? ""),
    audienceDefinition: String(formData.get("audienceDefinition") ?? ""),
    positioning: String(formData.get("positioning") ?? ""),
    contentPillars: list(formData.get("contentPillars")),
    restrictedTopics: list(formData.get("restrictedTopics")),
    ctaPreferences: list(formData.get("ctaPreferences")),
    geographicFocus: list(formData.get("geographicFocus")),
    riskTolerance: String(formData.get("riskTolerance") ?? ""),
    voiceSettings: {
      formality: numberValue(formData.get("formality")),
      warmth: numberValue(formData.get("warmth")),
      boldness: numberValue(formData.get("boldness")),
      humor: numberValue(formData.get("humor")),
      evidenceDensity: numberValue(formData.get("evidenceDensity")),
      sentenceStyle: String(formData.get("sentenceStyle") ?? ""),
      preferredVocabulary: list(formData.get("preferredVocabulary")),
      avoidVocabulary: list(formData.get("avoidVocabulary")),
      bannedPhrases: list(formData.get("bannedPhrases")),
    },
    generationDefaults: {
      targetLength: String(formData.get("targetLength") ?? ""),
      emojiPolicy: String(formData.get("emojiPolicy") ?? ""),
      hashtagPolicy: String(formData.get("hashtagPolicy") ?? ""),
      ctaStyle: String(formData.get("ctaStyle") ?? ""),
      defaultVariantCount: numberValue(formData.get("defaultVariantCount")),
    },
  });
}

async function audit({
  action,
  brandId,
  entityId,
  entityType,
  metadata,
  organizationId,
  userId,
}: {
  action: string;
  brandId: string | null;
  entityId?: string;
  entityType: string;
  metadata?: Record<string, unknown>;
  organizationId: string;
  userId: string;
}) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("audit_logs").insert({
    organization_id: organizationId,
    brand_id: brandId,
    actor_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata: metadata ?? {},
  });
  if (error) throw new Error(`Unable to write audit event: ${error.message}`);
}

export async function saveBrandProfile(brandId: string, formData: FormData) {
  const user = await requireAuthorizedBrand(brandId);
  const parsed = profileFromForm(formData);
  if (!parsed.success) formError(brandId, parsed.error.issues[0]?.message ?? "Invalid settings.");
  const policy = opportunitySelectionPolicySchema.safeParse({
    automaticSelection: formData.get("automaticOpportunitySelection") === "on",
    minimumScore: numberValue(formData.get("minimumOpportunityScore")),
    dailyDraftLimit: numberValue(formData.get("dailyDraftLimit")),
  });
  if (!policy.success) {
    formError(brandId, policy.error.issues[0]?.message ?? "Invalid opportunity policy.");
  }

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const cookieStore = await cookies();
    const serialized = JSON.stringify({
      opportunityPolicy: policy.data,
      profile: parsed.data,
    });
    if (serialized.length > 3_500) {
      formError(brandId, "Demo settings are too large to persist. Connect Supabase to save them.");
    }
    cookieStore.set(`${DEMO_OVERRIDE_PREFIX}${brandId}`, serialized, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    redirect(`/brands/${brandId}?saved=profile`);
  }

  const supabase = await createSupabaseServerClient();
  const [{ error: brandError }, { error: profileError }] = await Promise.all([
    supabase
      .from("brands")
      .update({
        name: parsed.data.name,
        slug: parsed.data.slug,
        description: parsed.data.description || null,
        website: parsed.data.website || null,
        default_language: parsed.data.defaultLanguage,
      })
      .eq("id", brandId)
      .eq("organization_id", user.organizationId),
    supabase.from("brand_profiles").upsert({
      brand_id: brandId,
      audience_definition: parsed.data.audienceDefinition || null,
      positioning: parsed.data.positioning || null,
      content_pillars: parsed.data.contentPillars,
      restricted_topics: parsed.data.restrictedTopics,
      cta_preferences: parsed.data.ctaPreferences,
      geographic_focus: parsed.data.geographicFocus,
      risk_tolerance: parsed.data.riskTolerance,
      voice_settings: parsed.data.voiceSettings,
      generation_defaults: parsed.data.generationDefaults,
      automatic_opportunity_selection: policy.data.automaticSelection,
      minimum_opportunity_score: policy.data.minimumScore,
      daily_draft_limit: policy.data.dailyDraftLimit,
    }),
  ]);
  const mutationError = brandError ?? profileError;
  if (mutationError) formError(brandId, mutationError.message);
  await audit({
    action: "brand.profile.updated",
    brandId,
    entityId: brandId,
    entityType: "brand",
    metadata: {
      fields: [...Object.keys(parsed.data), "opportunityPolicy"],
      opportunityPolicy: policy.data,
    },
    organizationId: user.organizationId,
    userId: user.id,
  });
  redirect(`/brands/${brandId}?saved=profile`);
}

function embeddingProvider() {
  if (process.env.AI_PROVIDER === "openai" && process.env.OPENAI_API_KEY) {
    return new OpenAIEmbeddingProvider(process.env.OPENAI_API_KEY);
  }
  return new FakeEmbeddingProvider();
}

export async function addBrandExample(brandId: string, formData: FormData) {
  const user = await requireAuthorizedBrand(brandId);
  const parsed = brandExampleInputSchema.safeParse({
    exampleType: String(formData.get("exampleType") ?? ""),
    content: String(formData.get("content") ?? ""),
    performanceNotes: String(formData.get("performanceNotes") ?? ""),
    approved: formData.get("approved") === "on",
  });
  if (!parsed.success) formError(brandId, parsed.error.issues[0]?.message ?? "Invalid example.");
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    redirect(`/brands/${brandId}?saved=demo-example`);
  }

  const embedding = await embeddingProvider().embed(parsed.data.content);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("brand_examples")
    .insert({
      brand_id: brandId,
      example_type: parsed.data.exampleType,
      content: parsed.data.content,
      performance_notes: parsed.data.performanceNotes || null,
      approved: parsed.data.approved,
      embedding: embedding.values,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) formError(brandId, error.message);
  await audit({
    action: "brand.example.created",
    brandId,
    entityId: data.id,
    entityType: "brand_example",
    metadata: { embeddingModel: embedding.model, embeddingTokens: embedding.usageTokens },
    organizationId: user.organizationId,
    userId: user.id,
  });
  redirect(`/brands/${brandId}?saved=example`);
}

export async function removeBrandExample(brandId: string, formData: FormData) {
  const user = await requireAuthorizedBrand(brandId);
  const exampleId = String(formData.get("exampleId") ?? "");
  if (!exampleId) formError(brandId, "Example identifier is required.");
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    redirect(`/brands/${brandId}?saved=demo-example`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("brand_examples")
    .delete()
    .eq("id", exampleId)
    .eq("brand_id", brandId);
  if (error) formError(brandId, error.message);
  await audit({
    action: "brand.example.removed",
    brandId,
    entityId: exampleId,
    entityType: "brand_example",
    organizationId: user.organizationId,
    userId: user.id,
  });
  redirect(`/brands/${brandId}?saved=example-removed`);
}

function safeFileName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export async function uploadBrandAsset(brandId: string, formData: FormData) {
  const user = await requireAuthorizedBrand(brandId);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) formError(brandId, "Choose an asset file.");
  const metadata = brandAssetMetadataSchema.safeParse({
    assetType: String(formData.get("assetType") ?? ""),
    originalName: file.name,
    mimeType: file.type,
    byteSize: file.size,
    altText: String(formData.get("altText") ?? ""),
    dominantColors: list(formData.get("dominantColors")),
  });
  if (!metadata.success) formError(brandId, metadata.error.issues[0]?.message ?? "Invalid asset.");
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    formError(brandId, "Connect the development Supabase project before uploading assets.");
  }

  const supabase = await createSupabaseServerClient();
  const objectId = randomUUID();
  const objectPath = `${user.organizationId}/${brandId}/assets/${objectId}-${safeFileName(file.name)}`;
  const bytes = await file.arrayBuffer();
  try {
    validateBrandAssetBytes(metadata.data, new Uint8Array(bytes));
  } catch (error) {
    formError(
      brandId,
      error instanceof Error ? error.message : "Asset contents failed validation.",
    );
  }
  const { error: uploadError } = await supabase.storage
    .from("brand-assets")
    .upload(objectPath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) formError(brandId, uploadError.message);

  const { data, error: rowError } = await supabase
    .from("brand_assets")
    .insert({
      brand_id: brandId,
      asset_type: metadata.data.assetType,
      storage_path: objectPath,
      metadata: metadata.data,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (rowError) {
    await supabase.storage.from("brand-assets").remove([objectPath]);
    formError(brandId, rowError.message);
  }
  await audit({
    action: "brand.asset.uploaded",
    brandId,
    entityId: data.id,
    entityType: "brand_asset",
    metadata: { assetType: metadata.data.assetType, mimeType: metadata.data.mimeType },
    organizationId: user.organizationId,
    userId: user.id,
  });
  redirect(`/brands/${brandId}?saved=asset`);
}

export async function removeBrandAsset(brandId: string, formData: FormData) {
  const user = await requireAuthorizedBrand(brandId);
  const assetId = String(formData.get("assetId") ?? "");
  if (!assetId) formError(brandId, "Asset identifier is required.");
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    redirect(`/brands/${brandId}?saved=demo-asset`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: asset, error: assetError } = await supabase
    .from("brand_assets")
    .select("storage_path")
    .eq("id", assetId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (assetError || !asset) formError(brandId, "Asset not found.");
  const { error: storageError } = await supabase.storage
    .from("brand-assets")
    .remove([asset.storage_path]);
  if (storageError) formError(brandId, storageError.message);
  const { error: rowError } = await supabase
    .from("brand_assets")
    .delete()
    .eq("id", assetId)
    .eq("brand_id", brandId);
  if (rowError) formError(brandId, rowError.message);
  await audit({
    action: "brand.asset.removed",
    brandId,
    entityId: assetId,
    entityType: "brand_asset",
    organizationId: user.organizationId,
    userId: user.id,
  });
  redirect(`/brands/${brandId}?saved=asset-removed`);
}

export async function setBrandArchived(brandId: string, formData: FormData) {
  const user = await requireAuthorizedBrand(brandId);
  if (!canManageOrganization(user.role)) {
    formError(brandId, "Only an administrator can archive or restore brands.");
  }
  const status = formData.get("archived") === "true" ? "archived" : "active";
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    redirect(`/brands/${brandId}?saved=demo-status`);
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("brands")
    .update({ status })
    .eq("id", brandId)
    .eq("organization_id", user.organizationId);
  if (error) formError(brandId, error.message);
  await audit({
    action: status === "archived" ? "brand.archived" : "brand.restored",
    brandId,
    entityId: brandId,
    entityType: "brand",
    organizationId: user.organizationId,
    userId: user.id,
  });
  redirect(`/brands/${brandId}?saved=status`);
}

export async function createBrand(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!canManageOrganization(user.role)) redirect("/brands?error=Administrator+role+required.");
  const parsed = brandProfileInputSchema
    .pick({
      name: true,
      slug: true,
      description: true,
      website: true,
      defaultLanguage: true,
    })
    .safeParse({
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      description: String(formData.get("description") ?? ""),
      website: String(formData.get("website") ?? ""),
      defaultLanguage: String(formData.get("defaultLanguage") ?? "en"),
    });
  if (!parsed.success) {
    redirect(
      `/brands?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid brand.")}`,
    );
  }
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    redirect("/brands?error=Connect+the+development+Supabase+project+to+create+brands.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("brands")
    .insert({
      organization_id: user.organizationId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description || null,
      website: parsed.data.website || null,
      default_language: parsed.data.defaultLanguage,
    })
    .select("id")
    .single();
  if (error) redirect(`/brands?error=${encodeURIComponent(error.message)}`);
  const { error: profileError } = await supabase
    .from("brand_profiles")
    .insert({ brand_id: data.id });
  if (profileError) redirect(`/brands?error=${encodeURIComponent(profileError.message)}`);
  await audit({
    action: "brand.created",
    brandId: data.id,
    entityId: data.id,
    entityType: "brand",
    organizationId: user.organizationId,
    userId: user.id,
  });
  redirect(`/brands/${data.id}?saved=created`);
}
