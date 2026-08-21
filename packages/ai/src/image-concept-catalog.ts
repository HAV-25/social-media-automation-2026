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

// Picks three archetypes that are guaranteed to diverge: one photographic, one
// conceptual, and one structured — which also yields three distinct render
// styles. The seed rotates *which* photographic and structured archetype is used
// so different topics don't all land on the same trio. `preferredStyle` (when a
// brand sets a default) biases the lead archetype.
export function selectDivergentConcepts(input: {
  seed: string;
  preferredStyle?: ImageStyle;
}): ConceptArchetype[] {
  const seed = hashSeed(input.seed);
  const photographic = CONCEPT_ARCHETYPES.filter((archetype) => archetype.group === "photographic");
  const conceptual = CONCEPT_ARCHETYPES.filter((archetype) => archetype.group === "conceptual");
  const structured = CONCEPT_ARCHETYPES.filter((archetype) => archetype.group === "structured");

  const lead =
    (input.preferredStyle
      ? photographic.find((archetype) => archetype.imageStyle === input.preferredStyle)
      : undefined) ?? photographic[seed % photographic.length]!;
  const middle = conceptual[Math.floor(seed / 7) % conceptual.length]!;
  const tail = structured[Math.floor(seed / 13) % structured.length]!;

  return [lead, middle, tail];
}
