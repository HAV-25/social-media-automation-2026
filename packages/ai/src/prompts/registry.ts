import {
  EVIDENCE_SYNTHESIZER_PROMPT_VERSION,
  EVIDENCE_SYNTHESIZER_SYSTEM_PROMPT,
} from "./evidence-synthesizer.v1";
import {
  FACEBOOK_WRITER_PROMPT_VERSION,
  FACEBOOK_WRITER_SYSTEM_PROMPT,
} from "./facebook-writer.v1";
import {
  OPPORTUNITY_ANALYST_PROMPT_VERSION,
  OPPORTUNITY_ANALYST_SYSTEM_PROMPT,
} from "./opportunity-analyst.v1";
import {
  ANGLE_ARCHITECT_PROMPT_VERSION,
  ANGLE_ARCHITECT_SYSTEM_PROMPT,
} from "./angle-architect.v1";
import { CLAIM_VERIFIER_PROMPT_VERSION, CLAIM_VERIFIER_SYSTEM_PROMPT } from "./claim-verifier.v1";
import { POST_CRITIC_PROMPT_VERSION, POST_CRITIC_SYSTEM_PROMPT } from "./post-critic.v1";
import {
  RESEARCH_PLANNER_PROMPT_VERSION,
  RESEARCH_PLANNER_SYSTEM_PROMPT,
} from "./research-planner.v1";
import { SOURCE_ANALYST_PROMPT_VERSION, SOURCE_ANALYST_SYSTEM_PROMPT } from "./source-analyst.v1";
import { IMAGE_DIRECTOR_PROMPT_VERSION, IMAGE_DIRECTOR_SYSTEM_PROMPT } from "./image-director.v1";

export const PRODUCTION_PROMPTS = [
  {
    task: "source_analysis",
    version: SOURCE_ANALYST_PROMPT_VERSION,
    systemPrompt: SOURCE_ANALYST_SYSTEM_PROMPT,
  },
  {
    task: "opportunity_analysis",
    version: OPPORTUNITY_ANALYST_PROMPT_VERSION,
    systemPrompt: OPPORTUNITY_ANALYST_SYSTEM_PROMPT,
  },
  {
    task: "research_planning",
    version: RESEARCH_PLANNER_PROMPT_VERSION,
    systemPrompt: RESEARCH_PLANNER_SYSTEM_PROMPT,
  },
  {
    task: "evidence_synthesis",
    version: EVIDENCE_SYNTHESIZER_PROMPT_VERSION,
    systemPrompt: EVIDENCE_SYNTHESIZER_SYSTEM_PROMPT,
  },
  {
    task: "facebook_writing",
    version: FACEBOOK_WRITER_PROMPT_VERSION,
    systemPrompt: FACEBOOK_WRITER_SYSTEM_PROMPT,
  },
  {
    task: "angle_architecture",
    version: ANGLE_ARCHITECT_PROMPT_VERSION,
    systemPrompt: ANGLE_ARCHITECT_SYSTEM_PROMPT,
  },
  {
    task: "post_critique",
    version: POST_CRITIC_PROMPT_VERSION,
    systemPrompt: POST_CRITIC_SYSTEM_PROMPT,
  },
  {
    task: "claim_verification",
    version: CLAIM_VERIFIER_PROMPT_VERSION,
    systemPrompt: CLAIM_VERIFIER_SYSTEM_PROMPT,
  },
  {
    task: "image_direction",
    version: IMAGE_DIRECTOR_PROMPT_VERSION,
    systemPrompt: IMAGE_DIRECTOR_SYSTEM_PROMPT,
  },
] as const;

export function getProductionPrompt(task: (typeof PRODUCTION_PROMPTS)[number]["task"]) {
  const prompt = PRODUCTION_PROMPTS.find((candidate) => candidate.task === task);
  if (!prompt) throw new Error(`Production prompt is not registered: ${task}`);
  return prompt;
}
