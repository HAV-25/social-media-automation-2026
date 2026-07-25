import {
  buildNormalizedBrandContext,
  defaultGenerationSettings,
  defaultVoiceSettings,
  type BrandContextInput,
  type BrandProfileInput,
  type StoredBrandAsset,
  type StoredBrandExample,
} from "@content-engine/brand-memory";
import { demoBrands } from "./demo-data";

type DemoBrandRecord = {
  brand: (typeof demoBrands)[number] & {
    description: string;
    website: string;
    defaultLanguage: string;
    status: "active" | "archived";
  };
  profile: BrandProfileInput;
  examples: StoredBrandExample[];
  assets: StoredBrandAsset[];
};

const identities: Record<
  (typeof demoBrands)[number]["slug"],
  {
    audience: string;
    positioning: string;
    pillars: string[];
    preferred: string[];
    avoid: string[];
    voice: Partial<typeof defaultVoiceSettings>;
  }
> = {
  klaank: {
    audience: "Leaders building modern organizations and teams.",
    positioning: "Clear, thoughtful signals about how work and leadership are changing.",
    pillars: ["Future of work", "Leadership", "Organizational design"],
    preferred: ["operating model", "human judgment", "organizational design"],
    avoid: ["disruption for disruption’s sake"],
    voice: { formality: 65, warmth: 55, boldness: 55, evidenceDensity: 80 },
  },
  spaarker: {
    audience: "Curious professionals who value fresh ideas and practical momentum.",
    positioning: "An optimistic spark that turns emerging ideas into useful conversation.",
    pillars: ["Ideas worth sharing", "Creative work", "Professional growth"],
    preferred: ["spark", "possibility", "momentum"],
    avoid: ["hustle harder"],
    voice: { formality: 35, warmth: 85, boldness: 65, humor: 35 },
  },
  "nations-of-tomorrow": {
    audience: "Policy, civic, and business leaders shaping resilient societies.",
    positioning: "Long-horizon analysis connecting policy choices to tomorrow’s institutions.",
    pillars: ["Public innovation", "Resilient institutions", "Emerging economies"],
    preferred: ["institutional capacity", "public value", "resilience"],
    avoid: ["inevitable outcome"],
    voice: { formality: 80, warmth: 35, boldness: 50, evidenceDensity: 95 },
  },
  "business-of-ai": {
    audience: "Executives and operators responsible for practical AI adoption.",
    positioning: "Evidence-led guidance for turning AI capability into operating results.",
    pillars: ["AI operating models", "Adoption", "Governance"],
    preferred: ["operating model", "accountability", "adoption"],
    avoid: ["AI will replace everyone"],
    voice: { formality: 70, warmth: 45, boldness: 60, evidenceDensity: 95 },
  },
  wyngs: {
    audience: "Founders and creative builders seeking clarity, confidence, and momentum.",
    positioning: "Energetic founder stories and practical prompts that help ideas take flight.",
    pillars: ["Founder stories", "Creative confidence", "Building in public"],
    preferred: ["take flight", "build", "learn"],
    avoid: ["overnight success"],
    voice: { formality: 25, warmth: 90, boldness: 85, humor: 45 },
  },
};

export const demoBrandRecords: DemoBrandRecord[] = demoBrands.map((brand, brandIndex) => {
  const identity = identities[brand.slug];
  const description = identity.positioning;
  const profile: BrandProfileInput = {
    name: brand.name,
    slug: brand.slug,
    description,
    website: "",
    defaultLanguage: "en",
    audienceDefinition: identity.audience,
    positioning: identity.positioning,
    contentPillars: identity.pillars,
    restrictedTopics: ["Unverified claims", "Guaranteed outcomes"],
    ctaPreferences: ["Invite a considered response"],
    geographicFocus: ["Global"],
    riskTolerance: brand.slug === "wyngs" ? "medium" : "low",
    voiceSettings: {
      ...defaultVoiceSettings,
      ...identity.voice,
      preferredVocabulary: identity.preferred,
      avoidVocabulary: identity.avoid,
    },
    generationDefaults: {
      ...defaultGenerationSettings,
      emojiPolicy: brand.slug === "spaarker" || brand.slug === "wyngs" ? "natural" : "never",
    },
  };

  return {
    brand: {
      ...brand,
      description,
      website: "",
      defaultLanguage: "en",
      status: "active",
    },
    profile,
    examples: [
      {
        id: `demo-example-${brandIndex + 1}`,
        brandId: brand.id,
        exampleType: "positive",
        content: `${brand.name} reference: ${identity.positioning} The post uses a clear point of view, a concrete implication, and an invitation to think.`,
        performanceNotes: "Illustrative demo example; replace with an approved team reference.",
        approved: true,
        createdAt: "2026-07-23T12:00:00.000Z",
      },
    ],
    assets: [],
  };
});

export function getDemoBrandRecord(brandId: string) {
  return demoBrandRecords.find((record) => record.brand.id === brandId);
}

export function getDemoBrandContext(brandId: string) {
  const record = getDemoBrandRecord(brandId);
  if (!record) return null;
  const contextInput: BrandContextInput = {
    brandId: record.brand.id,
    brandName: record.brand.name,
    brandDescription: record.brand.description,
    website: record.brand.website,
    profile: {
      audienceDefinition: record.profile.audienceDefinition,
      positioning: record.profile.positioning,
      contentPillars: record.profile.contentPillars,
      restrictedTopics: record.profile.restrictedTopics,
      ctaPreferences: record.profile.ctaPreferences,
      geographicFocus: record.profile.geographicFocus,
      riskTolerance: record.profile.riskTolerance,
      voiceSettings: record.profile.voiceSettings,
      generationDefaults: record.profile.generationDefaults,
    },
    examples: record.examples,
    assets: record.assets,
  };
  return buildNormalizedBrandContext(contextInput);
}
