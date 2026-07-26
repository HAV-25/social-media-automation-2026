import {
  contentStyleSchema,
  toneSchema,
  type ContentStyle,
  type Tone,
} from "@content-engine/contracts";

type EditorialStyleDefinition = {
  id: ContentStyle;
  label: string;
  shortLabel: string;
  purpose: string;
  outcome: string;
  structure: readonly string[];
  bestFor: readonly string[];
  avoid: readonly string[];
};

type ToneDefinition = {
  id: Tone;
  label: string;
  purpose: string;
  traits: readonly string[];
  guardrail: string;
};

export const editorialStyles = [
  {
    id: "newsworthy_authority",
    label: "Newsworthy Authority",
    shortLabel: "Newsworthy",
    purpose:
      "Turn a current development into a clear, credible explanation of what happened and why it matters.",
    outcome:
      "The reader should understand the change, its consequence, and the useful implication that ordinary coverage may miss.",
    structure: [
      "High-impact opening",
      "The development in plain language",
      "Critical facts and context",
      "Who or what it affects",
      "Distinctive implication",
      "Discussion-oriented close",
    ],
    bestFor: [
      "Announcements",
      "Product launches",
      "Research releases",
      "Market changes",
      "Emerging trends",
    ],
    avoid: [
      "Rewriting the headline",
      "Empty urgency",
      "Generic summaries",
      "Unsupported predictions",
    ],
  },
  {
    id: "educational_breakdown",
    label: "Educational Breakdown",
    shortLabel: "Educational",
    purpose:
      "Extract the strongest learning value and turn it into an explanation, framework, or practical lesson.",
    outcome:
      "The reader should leave with a clearer mental model and an idea they can apply, save, or share.",
    structure: [
      "Problem or misconception",
      "Key lesson",
      "Clear explanation",
      "Framework, steps, or examples",
      "Practical application",
      "Memorable takeaway",
    ],
    bestFor: ["Guides", "Reports", "Research", "Case studies", "Expert knowledge"],
    avoid: [
      "Obvious advice",
      "Excessive bullet lists",
      "Repeating a table of contents",
      "Teaching without application",
    ],
  },
  {
    id: "perspective_conversation",
    label: "Perspective & Conversation",
    shortLabel: "Perspective",
    purpose:
      "Develop a distinctive, evidence-backed point of view that invites reflection and informed conversation.",
    outcome:
      "The reader should encounter a thoughtful interpretation—not an automated news summary or manufactured hot take.",
    structure: [
      "Surprising or human opening",
      "Clear perspective",
      "Supporting evidence or story",
      "Tension or overlooked implication",
      "Balanced qualification",
      "Strong concluding thought",
    ],
    bestFor: [
      "Strategic implications",
      "Founder commentary",
      "Human stories",
      "Contrarian insight",
      "Common misconceptions",
    ],
    avoid: ["Manufactured outrage", "Engagement bait", "Unsupported hot takes", "False certainty"],
  },
] as const satisfies readonly EditorialStyleDefinition[];

export const toneOverlays = [
  {
    id: "authoritative",
    label: "Authoritative",
    purpose: "Confident, precise, calm, and evidence-led.",
    traits: ["Measured confidence", "Precise language", "Clear conclusions"],
    guardrail: "Confidence must never become unsupported certainty.",
  },
  {
    id: "conversational",
    label: "Conversational",
    purpose: "Natural, accessible, human, and less formal.",
    traits: ["Plain language", "Easy rhythm", "Direct reader connection"],
    guardrail: "Accessibility must not dilute evidence or become overly casual.",
  },
  {
    id: "bold",
    label: "Bold",
    purpose: "Direct, energetic, viewpoint-led, and economical.",
    traits: ["Shorter sentences", "Strong framing", "Decisive momentum"],
    guardrail: "Energy must not become sensationalism or exaggeration.",
  },
  {
    id: "thoughtful",
    label: "Thoughtful",
    purpose: "Reflective, nuanced, and emotionally intelligent.",
    traits: ["Balanced reasoning", "Useful qualification", "Calm interpretation"],
    guardrail: "Nuance must still lead to a clear and useful point.",
  },
  {
    id: "witty",
    label: "Witty",
    purpose: "Intelligent humor and light irony where the subject permits it.",
    traits: ["Light touch", "Memorable phrasing", "Human personality"],
    guardrail: "Never be flippant about safety, hardship, or serious claims.",
  },
] as const satisfies readonly ToneDefinition[];

const styleById = new Map<ContentStyle, EditorialStyleDefinition>(
  editorialStyles.map((style) => [style.id, style]),
);
const toneById = new Map<Tone, ToneDefinition>(toneOverlays.map((tone) => [tone.id, tone]));

export function getEditorialStyle(value: unknown) {
  const parsed = contentStyleSchema.safeParse(value);
  return styleById.get(parsed.success ? parsed.data : "perspective_conversation")!;
}

export function getToneOverlay(value: unknown) {
  const parsed = toneSchema.safeParse(value);
  return toneById.get(parsed.success ? parsed.data : "thoughtful")!;
}

export function explainStyleTone(style: ContentStyle, tone: Tone) {
  const styleDefinition = styleById.get(style)!;
  const toneDefinition = toneById.get(tone)!;
  return `${styleDefinition.shortLabel} controls the post's strategic structure. ${toneDefinition.label} controls how that structure sounds. The evidence and brand-safety rules remain unchanged.`;
}
