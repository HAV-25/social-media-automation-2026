import { z } from "zod";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import {
  angleCandidateSchema,
  draftEvaluationSchema,
  evidencePackageSchema,
  imageDirectionSchema,
  imageTemplateSchema,
  imageValidationSchema,
  postContentSchema,
} from "@content-engine/contracts";

export function uuidFromDeterministicHash(hash: string) {
  const value = hash.slice(0, 32).split("");
  value[12] = "4";
  value[16] = ((Number.parseInt(value[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const compact = value.join("");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20, 32)}`;
}

export const demoContentRecordSchema = z.object({
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  sourceDocumentId: z.uuid(),
  opportunityId: z.uuid(),
  generationRunId: z.uuid(),
  brandId: z.uuid(),
  sourceType: z
    .enum(["rss", "url", "pdf", "transcript", "social_content", "plain_text"])
    .default("plain_text"),
  title: z.string().max(1_000),
  cleanText: z.string().max(500_000).optional(),
  language: z.string().max(20).default("en"),
  canonicalUrl: z.url().max(4_096).optional(),
  nucleus: z.string().max(300),
  namedEntities: z.array(z.string().max(200)).max(20).default([]),
  topicTags: z.array(z.string().max(100)).max(8).default([]),
  recommendedStyle: z
    .enum(["newsworthy_authority", "educational_breakdown", "perspective_conversation"])
    .default("perspective_conversation"),
  classificationReasons: z.array(z.string().max(300)).max(5).default([]),
  score: z.number().min(0).max(100),
  riskPenalty: z.number().min(0).max(30),
  dimensions: z
    .array(
      z.object({
        key: z.string().min(1).max(80),
        score: z.number().min(0).max(100),
        maximum: z.number().positive().max(100),
      }),
    )
    .max(9),
  riskReasons: z.array(z.string().max(200)).max(5),
  createdAt: z.iso.datetime(),
});
export type DemoContentRecord = z.infer<typeof demoContentRecordSchema>;

const demoContentRecordsSchema = z.array(demoContentRecordSchema).max(8);

export function parseDemoContentRecords(value?: string) {
  if (!value) return [];
  try {
    const parsed = demoContentRecordsSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function serializeDemoContentRecords(records: DemoContentRecord[]) {
  return JSON.stringify(records.slice(0, 8));
}

const demoPostVersionSchema = z.object({
  id: z.uuid(),
  versionNumber: z.number().int().positive(),
  content: postContentSchema,
  generationType: z.enum(["initial", "manual_edit", "selective_regeneration"]),
  createdAt: z.iso.datetime(),
});

export const demoDraftRecordSchema = z.object({
  postDraftId: z.uuid(),
  postVersionId: z.uuid(),
  versionNumber: z.number().int().positive(),
  generationRunId: z.uuid(),
  opportunityId: z.uuid(),
  brandId: z.uuid(),
  contentStyle: z.enum([
    "newsworthy_authority",
    "educational_breakdown",
    "perspective_conversation",
  ]),
  tone: z.enum(["authoritative", "conversational", "bold", "thoughtful", "witty"]),
  status: z.enum(["ready_for_review", "approved", "rejected", "changes_requested"]),
  angles: z.array(angleCandidateSchema).length(3),
  selectedAngleKey: z.string().regex(/^angle_[a-z0-9]{6,40}$/),
  content: postContentSchema,
  versions: z.array(demoPostVersionSchema).min(1).max(10),
  evaluation: draftEvaluationSchema,
  revisionCount: z.number().int().min(0).max(2),
  model: z.string(),
  promptVersion: z.string(),
  responseId: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  feedback: z
    .array(
      z.object({
        eventType: z.string().max(80),
        reason: z.string().max(2_000),
        createdAt: z.iso.datetime(),
      }),
    )
    .max(10),
  createdAt: z.iso.datetime(),
});
export type DemoDraftRecord = z.infer<typeof demoDraftRecordSchema>;

const demoDraftRecordsSchema = z.array(demoDraftRecordSchema).max(3);

export function parseDemoDraftRecords(value?: string) {
  if (!value) return [];
  try {
    const serialized = value.startsWith("z:")
      ? inflateRawSync(Buffer.from(value.slice(2), "base64url")).toString("utf8")
      : value;
    const parsed = demoDraftRecordsSchema.safeParse(JSON.parse(serialized));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function serializeDemoDraftRecords(records: DemoDraftRecord[]) {
  const serialized = JSON.stringify(records.slice(0, 3));
  return `z:${deflateRawSync(serialized).toString("base64url")}`;
}

export const demoResearchRecordSchema = z.object({
  opportunityId: z.uuid(),
  researchRunId: z.uuid(),
  generationRunId: z.uuid(),
  evidencePackage: evidencePackageSchema,
  model: z.string().min(1).max(200),
  promptVersion: z.string().min(1).max(100),
  responseId: z.string().min(1).max(500),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    webSearchCalls: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().nonnegative(),
  }),
  createdAt: z.iso.datetime(),
});
export type DemoResearchRecord = z.infer<typeof demoResearchRecordSchema>;

const demoResearchRecordsSchema = z.array(demoResearchRecordSchema).max(1);

export function parseDemoResearchRecords(value?: string) {
  if (!value) return [];
  try {
    const parsed = demoResearchRecordsSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function serializeDemoResearchRecords(records: DemoResearchRecord[]) {
  return JSON.stringify(records.slice(0, 1));
}

export const demoImageRecordSchema = z.object({
  postDraftId: z.uuid(),
  postVersionId: z.uuid(),
  imageAssetId: z.uuid(),
  imageDirection: imageDirectionSchema,
  selectedConceptKey: z.string().regex(/^concept_[a-z0-9]{6,40}$/),
  template: imageTemplateSchema,
  baseSeed: z.string().trim().min(16).max(200),
  validation: imageValidationSchema,
  model: z.string().trim().min(1).max(200),
  promptVersion: z.string().trim().min(1).max(100),
  providerResponseId: z.string().trim().min(1).max(500),
  estimatedCostUsd: z.number().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type DemoImageRecord = z.infer<typeof demoImageRecordSchema>;

const demoImageRecordsSchema = z.array(demoImageRecordSchema).max(3);

export function parseDemoImageRecords(value?: string) {
  if (!value) return [];
  try {
    const serialized = value.startsWith("z:")
      ? inflateRawSync(Buffer.from(value.slice(2), "base64url")).toString("utf8")
      : value;
    const parsed = demoImageRecordsSchema.safeParse(JSON.parse(serialized));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function serializeDemoImageRecords(records: DemoImageRecord[]) {
  return `z:${deflateRawSync(JSON.stringify(records.slice(0, 3))).toString("base64url")}`;
}
