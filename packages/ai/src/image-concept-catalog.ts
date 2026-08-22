import type { BrandVisualIdentity } from "@content-engine/brand-memory";
import type { ImageStyle } from "@content-engine/contracts";

// A concept archetype is a *distinct visual approach* to a topic — not a topic.
// The old director hardcoded three near-identical "editorial hero" archetypes,
// which is why every image looked the same. The catalog below deliberately
// spans literal / conceptual / structured treatments and different render
// styles so the three angles of one topic diverge.
//
// Slice 1 ships this as an in-repo catalog (demo-verifiable). Slice 2 moves the
// same definitions into the DB so a brand can enable/weight/extend them, and the
// prod edge-function director reads them.
export type ConceptArchetype = {
  id: string;
  title: string;
  imageStyle: ImageStyle;
  treatment: "literal" | "conceptual";
  // How to translate the topic into this archetype's visual approach. Each
  // returns a *different* brief for the same topic, which is what forces variety.
  brief: (topic: string) => string;
  // The framing / negative-space recipe for the base artwork.
  composition: string;
  rationale: string;
  baseScore: number;
  // Grouping used by the divergent selector.
  group: "photographic" | "conceptual" | "structured";
};

const AVOID = [
  "all generated text and typography",
  "logos, watermarks, or third-party brand marks",
  "sensational or misleading visual claims",
  "famous people or protected characters",
] as const;

export const CONCEPT_AVOID: readonly string[] = AVOID;

export const CONCEPT_ARCHETYPES: readonly ConceptArchetype[] = [
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
    rationale:
      "The clearest editorial read with strong mobile legibility and restrained authority.",
    baseScore: 93,
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
    rationale: "A tactile, distinctive crop that avoids the generic wide 'hero' cliché.",
    baseScore: 88,
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
    baseScore: 86,
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
    rationale:
      "Makes the underlying change understandable without illustrating unsupported specifics.",
    baseScore: 84,
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
    baseScore: 82,
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
    baseScore: 80,
  },
];

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

// Resolves the effective catalog for a brand: the enabled subset of the system
// catalog (empty = all) plus any brand-authored custom concepts. Falls back to
// the full system catalog when a brand has no visual identity configured, so
// unconfigured brands behave exactly as before.
export function resolveBrandCatalog(visualIdentity?: BrandVisualIdentity): ConceptArchetype[] {
  if (!visualIdentity) return [...CONCEPT_ARCHETYPES];
  const enabled = visualIdentity.enabledConceptIds ?? [];
  const system =
    enabled.length > 0
      ? CONCEPT_ARCHETYPES.filter((archetype) => enabled.includes(archetype.id))
      : [...CONCEPT_ARCHETYPES];
  const custom: ConceptArchetype[] = (visualIdentity.customConcepts ?? []).map((entry) => ({
    id: entry.id,
    title: entry.title,
    imageStyle: entry.imageStyle,
    treatment: entry.treatment,
    group: entry.treatment === "literal" ? "photographic" : "conceptual",
    brief: (topic: string) => `${entry.brief}: ${topic}`,
    composition: entry.composition,
    rationale: `Brand-defined concept "${entry.title}".`,
    baseScore: 85,
  }));
  const combined = [...system, ...custom];
  return combined.length > 0 ? combined : [...CONCEPT_ARCHETYPES];
}

// Picks three archetypes that diverge: one photographic, one conceptual, and one
// structured — which also yields distinct render styles. The seed rotates which
// archetype within each group is used, so different topics don't all land on the
// same trio. `preferredStyle` biases the lead. Robust to a brand's catalog that
// omits whole groups: it still returns three distinct archetypes, preferring
// group and style divergence.
export function selectDivergentConcepts(input: {
  seed: string;
  preferredStyle?: ImageStyle;
  catalog?: readonly ConceptArchetype[];
}): ConceptArchetype[] {
  const catalog = input.catalog && input.catalog.length > 0 ? input.catalog : CONCEPT_ARCHETYPES;
  const seed = hashSeed(input.seed);
  const picked: ConceptArchetype[] = [];
  const usedIds = new Set<string>();
  const usedStyles = new Set<string>();
  const usedGroups = new Set<string>();

  const take = (archetype: ConceptArchetype | undefined) => {
    if (!archetype || usedIds.has(archetype.id) || picked.length >= 3) return;
    picked.push(archetype);
    usedIds.add(archetype.id);
    usedStyles.add(archetype.imageStyle);
    usedGroups.add(archetype.group);
  };

  if (input.preferredStyle) {
    const leadOptions = catalog.filter(
      (archetype) => archetype.imageStyle === input.preferredStyle,
    );
    if (leadOptions.length > 0) take(leadOptions[seed % leadOptions.length]);
  }

  for (const group of ["photographic", "conceptual", "structured"] as const) {
    if (picked.length >= 3 || usedGroups.has(group)) continue;
    const options = catalog.filter(
      (archetype) => archetype.group === group && !usedIds.has(archetype.id),
    );
    if (options.length === 0) continue;
    const fresh = options.filter((archetype) => !usedStyles.has(archetype.imageStyle));
    const pool = fresh.length > 0 ? fresh : options;
    take(pool[seed % pool.length]);
  }

  if (picked.length < 3) {
    const remaining = catalog.filter((archetype) => !usedIds.has(archetype.id));
    const fresh = remaining.filter((archetype) => !usedStyles.has(archetype.imageStyle));
    for (const archetype of [...fresh, ...remaining]) take(archetype);
  }

  return picked.slice(0, 3);
}
