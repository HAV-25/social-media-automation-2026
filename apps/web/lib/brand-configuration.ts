import {
  brandProfileInputSchema,
  brandAssetMetadataSchema,
  buildNormalizedBrandContext,
  defaultGenerationSettings,
  defaultVoiceSettings,
  generationDefaultsSchema,
  voiceSettingsSchema,
  type BrandContextInput,
  type BrandProfileInput,
  type StoredBrandAsset,
  type StoredBrandExample,
} from "@content-engine/brand-memory";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getDemoBrandRecord } from "./demo-brand-memory";
import { demoBrandRecords } from "./demo-brand-memory";
import { createSupabaseServiceClient } from "./supabase/service";
import { createSupabaseServerClient } from "./supabase/server";

export type BrandConfiguration = {
  brand: {
    id: string;
    organizationId: string;
    name: string;
    slug: string;
    description: string;
    website: string;
    defaultLanguage: string;
    status: "active" | "archived";
  };
  profile: BrandProfileInput;
  examples: StoredBrandExample[];
  assets: Array<StoredBrandAsset & { previewUrl?: string }>;
  context: ReturnType<typeof buildNormalizedBrandContext>;
};

function createContext(configuration: Omit<BrandConfiguration, "context">) {
  const input: BrandContextInput = {
    brandId: configuration.brand.id,
    brandName: configuration.brand.name,
    brandDescription: configuration.brand.description,
    website: configuration.brand.website,
    profile: {
      audienceDefinition: configuration.profile.audienceDefinition,
      positioning: configuration.profile.positioning,
      contentPillars: configuration.profile.contentPillars,
      restrictedTopics: configuration.profile.restrictedTopics,
      ctaPreferences: configuration.profile.ctaPreferences,
      geographicFocus: configuration.profile.geographicFocus,
      riskTolerance: configuration.profile.riskTolerance,
      voiceSettings: configuration.profile.voiceSettings,
      generationDefaults: configuration.profile.generationDefaults,
    },
    examples: configuration.examples,
    assets: configuration.assets,
  };
  return buildNormalizedBrandContext(input);
}

async function getDemoBrandConfiguration(brandId: string): Promise<BrandConfiguration | null> {
  const record = getDemoBrandRecord(brandId);
  if (!record) return null;
  const cookieStore = await cookies();
  const overrideValue = cookieStore.get(`brand-memory-demo-${brandId}`)?.value;
  let profile = record.profile;
  if (overrideValue) {
    try {
      const override = JSON.parse(overrideValue) as { profile?: unknown };
      const parsed = brandProfileInputSchema.safeParse(override.profile);
      if (parsed.success) profile = parsed.data;
    } catch {
      // Invalid demo cookies are ignored; production state is never cookie-backed.
    }
  }
  const base = {
    brand: {
      id: record.brand.id,
      organizationId: "10000000-0000-4000-8000-000000000001",
      name: profile.name,
      slug: profile.slug,
      description: profile.description,
      website: profile.website,
      defaultLanguage: profile.defaultLanguage,
      status: record.brand.status,
    },
    profile,
    examples: record.examples,
    assets: record.assets,
  };
  return { ...base, context: createContext(base) };
}

async function getPersistentBrandConfiguration(
  brandId: string,
  supabase: SupabaseClient,
): Promise<BrandConfiguration | null> {
  const [
    { data: brand, error: brandError },
    { data: profile, error: profileError },
    { data: examples, error: exampleError },
    { data: assets, error: assetError },
  ] = await Promise.all([
    supabase
      .from("brands")
      .select("id,organization_id,name,slug,description,website,default_language,status")
      .eq("id", brandId)
      .maybeSingle(),
    supabase.from("brand_profiles").select("*").eq("brand_id", brandId).maybeSingle(),
    supabase
      .from("brand_examples")
      .select("id,brand_id,example_type,content,performance_notes,approved,created_at,embedding")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false }),
    supabase
      .from("brand_assets")
      .select("id,asset_type,storage_path,metadata")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false }),
  ]);

  const firstError = brandError ?? profileError ?? exampleError ?? assetError;
  if (firstError) throw new Error(`Unable to load brand configuration: ${firstError.message}`);
  if (!brand) return null;

  const voiceSettings = voiceSettingsSchema.parse(profile?.voice_settings ?? defaultVoiceSettings);
  const generationDefaults = generationDefaultsSchema.parse(
    profile?.generation_defaults ?? defaultGenerationSettings,
  );
  const mappedExamples: StoredBrandExample[] = (examples ?? []).map((example) => ({
    id: example.id,
    brandId: example.brand_id,
    exampleType: example.example_type,
    content: example.content,
    performanceNotes: example.performance_notes ?? "",
    approved: example.approved,
    createdAt: example.created_at,
    embedding: Array.isArray(example.embedding)
      ? example.embedding.map((value: unknown) => Number(value))
      : null,
  }));
  const mappedAssets: StoredBrandAsset[] = (assets ?? []).map((asset) => {
    const metadata = brandAssetMetadataSchema.parse(asset.metadata);
    if (metadata.assetType !== asset.asset_type) {
      throw new Error(`Brand asset ${asset.id} has inconsistent type metadata.`);
    }
    return {
      id: asset.id,
      storagePath: asset.storage_path,
      ...metadata,
    };
  });
  const previewByPath = new Map<string, string>();
  if (mappedAssets.length > 0) {
    const { data: signedAssets, error: signedAssetError } = await supabase.storage
      .from("brand-assets")
      .createSignedUrls(
        mappedAssets.map((asset) => asset.storagePath),
        600,
      );
    if (signedAssetError) {
      throw new Error(`Unable to create private asset previews: ${signedAssetError.message}`);
    }
    for (const signedAsset of signedAssets ?? []) {
      if (signedAsset.signedUrl && signedAsset.path) {
        previewByPath.set(signedAsset.path, signedAsset.signedUrl);
      }
    }
  }
  const assetsWithPreviews = mappedAssets.map((asset) => ({
    ...asset,
    previewUrl: previewByPath.get(asset.storagePath),
  }));
  const base = {
    brand: {
      id: brand.id,
      organizationId: brand.organization_id,
      name: brand.name,
      slug: brand.slug,
      description: brand.description ?? "",
      website: brand.website ?? "",
      defaultLanguage: brand.default_language,
      status: brand.status,
    },
    profile: {
      name: brand.name,
      slug: brand.slug,
      description: brand.description ?? "",
      website: brand.website ?? "",
      defaultLanguage: brand.default_language,
      audienceDefinition: profile?.audience_definition ?? "",
      positioning: profile?.positioning ?? "",
      contentPillars: profile?.content_pillars ?? [],
      restrictedTopics: profile?.restricted_topics ?? [],
      ctaPreferences: profile?.cta_preferences ?? [],
      geographicFocus: profile?.geographic_focus ?? [],
      riskTolerance: profile?.risk_tolerance ?? "medium",
      voiceSettings,
      generationDefaults,
    } satisfies BrandProfileInput,
    examples: mappedExamples,
    assets: assetsWithPreviews,
  };
  return { ...base, context: createContext(base) };
}

export async function getBrandConfiguration(brandId: string): Promise<BrandConfiguration | null> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    return getDemoBrandConfiguration(brandId);
  }

  const supabase = await createSupabaseServerClient();
  return getPersistentBrandConfiguration(brandId, supabase);
}

export async function getBrandConfigurationForWorkflow(
  brandId: string,
): Promise<BrandConfiguration | null> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    return getDemoBrandConfiguration(brandId);
  }
  return getPersistentBrandConfiguration(brandId, createSupabaseServiceClient());
}

export async function getBrandDirectory() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const configurations = await Promise.all(
      demoBrandRecords.map((record) => getBrandConfiguration(record.brand.id)),
    );
    return configurations.filter(
      (configuration): configuration is BrandConfiguration => configuration !== null,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("brands").select("id").order("status").order("name");
  if (error) throw new Error(`Unable to load brands: ${error.message}`);
  const configurations = await Promise.all(
    (data ?? []).map((brand) => getBrandConfiguration(brand.id)),
  );
  return configurations.filter(
    (configuration): configuration is BrandConfiguration => configuration !== null,
  );
}
