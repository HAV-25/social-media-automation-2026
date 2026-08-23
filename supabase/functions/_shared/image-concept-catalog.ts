// Deno port of packages/ai/src/image-concept-catalog.ts, kept self-contained
// (no monorepo imports) for the edge runtime. Keep the two in sync.
//
// A concept archetype is a distinct *visual approach* to a topic. The prod image
// director used one fixed prompt for every post, so images looked identical
// except the subject. Mapping each post's content_style to a different archetype
// group makes the three angles of one topic genuinely diverge, and a brand's
// visual identity tunes palette, medium, art direction, and which concepts are
// allowed.

export type ConceptGroup = "photographic" | "conceptual" | "structured";
export type ConceptTreatment = "literal" | "conceptual";
export type ImageStyleId =
  | "editorial_hero"
  | "insight_card"
  | "conceptual_illustration"
  | "branded_headline_card";

export type ConceptArchetype = {
  id: string;
  title: string;
  imageStyle: ImageStyleId;
  treatment: ConceptTreatment;
  group: ConceptGroup;
  brief: (topic: string) => string;
  composition: string;
  rationale: string;
};

export type BrandVisualIdentity = {
  primaryMedium: "photographic" | "illustration" | "mixed";
  palette: { primary?: string; accent?: string; neutral?: string };
  mood: string;
  artDirection: string;
  enabledConceptIds: string[];
  preferredStyle?: ImageStyleId;
  customConcepts: Array<{
    id: string;
    title: string;
    imageStyle: ImageStyleId;
    treatment: ConceptTreatment;
    brief: string;
    composition: string;
  }>;
};

export const ARCHETYPES: ConceptArchetype[] = [
  {
    id: "literal_hero",
    title: "Literal hero",
    imageStyle: "editorial_hero",
    treatment: "literal",
    group: "photographic",
    brief: (topic) =>
      `Show the real subject of this story as one confident hero shot, credible and restrained: ${topic}. Close framing, shallow depth of field, natural light.`,
    composition:
      "One confident focal subject in the right third, a quiet contextual background, and generous calm negative space on the left for typography.",
    rationale: "The clearest editorial read with strong mobile legibility and restrained authority.",
  },
  {
    id: "macro_detail",
    title: "Macro detail",
    imageStyle: "editorial_hero",
    treatment: "literal",
    group: "photographic",
    brief: (topic) =>
      `Frame one telling detail of this story in extreme close-up, abstract and textural: ${topic}. Fill the frame with shape and material, shallow focus.`,
    composition:
      "An extreme close-up filling the frame with texture and form, shallow focus, and one calm corner reserved for typography.",
    rationale: "A tactile, distinctive crop that avoids the generic wide hero cliché.",
  },
  {
    id: "human_context",
    title: "Human context",
    imageStyle: "branded_headline_card",
    treatment: "literal",
    group: "photographic",
    brief: (topic) =>
      `Show the human or operational context around this story, grounded and environmental: ${topic}. A person or workspace at real scale, atmospheric.`,
    composition:
      "A wider environmental frame with a human or operational element off-centre, atmospheric depth, and open wall or sky area for typography.",
    rationale: "Adds human scale and operational realism the audience recognises.",
  },
  {
    id: "conceptual_metaphor",
    title: "Conceptual metaphor",
    imageStyle: "conceptual_illustration",
    treatment: "conceptual",
    group: "conceptual",
    brief: (topic) =>
      `Express the underlying idea of this story as a restrained visual metaphor, adding no factual claims: ${topic}. Suggest the shift, do not illustrate specifics literally.`,
    composition:
      "A centred visual metaphor with strong depth, balanced negative space framing the transition, and an uncluttered left panel for typography.",
    rationale: "Makes the underlying change understandable without illustrating unsupported specifics.",
  },
  {
    id: "process_flow",
    title: "Process flow",
    imageStyle: "insight_card",
    treatment: "conceptual",
    group: "structured",
    brief: (topic) =>
      `Show the mechanism behind this story as a clean, structured sequence of its key steps: ${topic}. A few purposeful forms in order, no words or numbers.`,
    composition:
      "A structured left-to-right arrangement of a few purposeful forms, even spacing, and a reserved lower or left band for typography.",
    rationale: "Explains the how of the story in a structured, scannable frame.",
  },
  {
    id: "data_signal",
    title: "Data signal",
    imageStyle: "insight_card",
    treatment: "conceptual",
    group: "structured",
    brief: (topic) =>
      `Imply the measurable shift in this story through an abstract, non-literal data motif: ${topic}. No charts, axes, or numbers — only implied measurement and flow.`,
    composition:
      "An abstract still-life of a few geometric forms implying measurement or flow, strong negative space, and a clean reserved panel for typography.",
    rationale: "Signals a measurable shift without fabricating specific figures.",
  },
];

// Deterministically maps a post's content_style to a concept group so the three
// angles of one topic land in three different visual approaches.
const CONTENT_STYLE_GROUP: Record<string, ConceptGroup> = {
  newsworthy_authority: "photographic",
  educational_breakdown: "structured",
  perspective_conversation: "conceptual",
};

export const DEFAULT_VISUAL_IDENTITY: BrandVisualIdentity = {
  primaryMedium: "mixed",
  palette: {},
  mood: "",
  artDirection: "",
  enabledConceptIds: [],
  preferredStyle: undefined,
  customConcepts: [],
};

const IMAGE_STYLES: ImageStyleId[] = [
  "editorial_hero",
  "insight_card",
  "conceptual_illustration",
  "branded_headline_card",
];

function hexOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : undefined;
}

function asStyle(value: unknown): ImageStyleId | undefined {
  return typeof value === "string" && (IMAGE_STYLES as string[]).includes(value)
    ? (value as ImageStyleId)
    : undefined;
}

// Defensive parse of the brand_profiles.visual_identity jsonb. Any missing or
// malformed field falls back to the default, so an unconfigured brand behaves
// exactly as before this feature existed.
export function parseVisualIdentity(raw: unknown): BrandVisualIdentity {
  if (!raw || typeof raw !== "object") return DEFAULT_VISUAL_IDENTITY;
  const value = raw as Record<string, unknown>;
  const paletteRaw = (value.palette ?? {}) as Record<string, unknown>;
  const medium = value.primaryMedium;
  const customRaw = Array.isArray(value.customConcepts) ? value.customConcepts : [];
  return {
    primaryMedium:
      medium === "photographic" || medium === "illustration" ? medium : "mixed",
    palette: {
      primary: hexOrUndefined(paletteRaw.primary),
      accent: hexOrUndefined(paletteRaw.accent),
      neutral: hexOrUndefined(paletteRaw.neutral),
    },
    mood: typeof value.mood === "string" ? value.mood.slice(0, 300) : "",
    artDirection: typeof value.artDirection === "string" ? value.artDirection.slice(0, 2000) : "",
    enabledConceptIds: Array.isArray(value.enabledConceptIds)
      ? value.enabledConceptIds.filter((entry): entry is string => typeof entry === "string")
      : [],
    preferredStyle: asStyle(value.preferredStyle),
    customConcepts: customRaw
      .map((entry) => {
        const record = (entry ?? {}) as Record<string, unknown>;
        const style = asStyle(record.imageStyle);
        if (
          typeof record.id !== "string" ||
          typeof record.title !== "string" ||
          typeof record.brief !== "string" ||
          typeof record.composition !== "string" ||
          !style
        ) {
          return null;
        }
        return {
          id: record.id,
          title: record.title,
          imageStyle: style,
          treatment: record.treatment === "literal" ? "literal" : "conceptual",
          brief: record.brief,
          composition: record.composition,
        } as BrandVisualIdentity["customConcepts"][number];
      })
      .filter((entry): entry is BrandVisualIdentity["customConcepts"][number] => entry !== null),
  };
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

// Enabled system concepts (empty = all) plus brand custom concepts.
export function resolveBrandCatalog(visualIdentity: BrandVisualIdentity): ConceptArchetype[] {
  const enabled = visualIdentity.enabledConceptIds ?? [];
  const system =
    enabled.length > 0 ? ARCHETYPES.filter((archetype) => enabled.includes(archetype.id)) : ARCHETYPES;
  const custom: ConceptArchetype[] = (visualIdentity.customConcepts ?? []).map((entry) => ({
    id: entry.id,
    title: entry.title,
    imageStyle: entry.imageStyle,
    treatment: entry.treatment,
    group: entry.treatment === "literal" ? "photographic" : "conceptual",
    brief: (topic: string) => `${entry.brief}: ${topic}`,
    composition: entry.composition,
    rationale: `Brand-defined concept "${entry.title}".`,
  }));
  const combined = [...system, ...custom];
  return combined.length > 0 ? combined : ARCHETYPES;
}

// Picks one archetype for a single draft: its content_style chooses the group
// (so the three angles of a topic diverge), the seed rotates within that group,
// and a brand's preferred style biases selection when it fits the group.
export function selectConceptForDraft(input: {
  seed: string;
  contentStyle: string;
  catalog: ConceptArchetype[];
  preferredStyle?: ImageStyleId;
}): ConceptArchetype {
  const catalog = input.catalog.length > 0 ? input.catalog : ARCHETYPES;
  const hash = hashSeed(`${input.contentStyle}:${input.seed}`);
  const group = CONTENT_STYLE_GROUP[input.contentStyle];
  const inGroup = group ? catalog.filter((archetype) => archetype.group === group) : [];
  const pool = inGroup.length > 0 ? inGroup : catalog;
  const preferredInPool = input.preferredStyle
    ? pool.filter((archetype) => archetype.imageStyle === input.preferredStyle)
    : [];
  const chosenPool = preferredInPool.length > 0 ? preferredInPool : pool;
  return chosenPool[hash % chosenPool.length] ?? catalog[0]!;
}

// Builds the enriched, per-concept image prompt. When the brand has no visual
// identity and a generic concept is used, this stays close to the original
// fixed prompt plus the concept's visual approach.
export function buildImagePrompt(input: {
  systemPrompt: string;
  brandName: string;
  hook: string;
  body: string;
  concept: ConceptArchetype;
  visualIdentity: BrandVisualIdentity;
}): string {
  const topic = `${input.hook} ${input.body}`.replace(/\s+/g, " ").trim().slice(0, 1200);
  const vi = input.visualIdentity;
  const artParts: string[] = [];
  if (vi.primaryMedium !== "mixed") artParts.push(`Preferred medium: ${vi.primaryMedium}.`);
  if (vi.mood) artParts.push(`Mood: ${vi.mood}.`);
  if (vi.artDirection) artParts.push(`Brand art direction: ${vi.artDirection}.`);
  const art = artParts.length > 0 ? ` ${artParts.join(" ")}` : "";
  return [
    input.systemPrompt,
    `BRAND: ${input.brandName}`,
    `VISUAL APPROACH: ${input.concept.title} — ${input.concept.brief(topic)}`,
    `COMPOSITION: ${input.concept.composition}${art}`,
    `POST HOOK: ${input.hook}`,
    `POST CONTEXT: ${input.body.slice(0, 1200)}`,
    "Create only the text-free base artwork.",
  ].join("\n");
}
