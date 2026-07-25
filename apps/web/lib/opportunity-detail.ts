import { opportunityScoreBreakdownSchema } from "@content-engine/contracts";
import { cookies } from "next/headers";
import { z } from "zod";
import { parseDemoContentRecords } from "./demo-content-store";
import { createSupabaseServerClient } from "./supabase/server";

const dimensionLabels: Record<string, string> = {
  newsOrLearningValue: "News or learning value",
  audienceRelevance: "Audience relevance",
  consequenceOrUsefulness: "Consequence or usefulness",
  novelty: "Novelty",
  evidenceStrength: "Evidence strength",
  shareability: "Shareability",
  conversationPotential: "Conversation potential",
  brandAuthorityFit: "Brand-authority fit",
  timeliness: "Timeliness",
};

export type OpportunityDetail = {
  id: string;
  brandId: string;
  title: string;
  sourceType: string;
  canonicalUrl?: string;
  cleanText: string;
  language: string;
  createdAt: string;
  valueNucleus: string;
  score: number;
  riskPenalty: number;
  status: string;
  recommendedStyle: string;
  namedEntities: string[];
  topicTags: string[];
  classificationReasons: string[];
  dimensions: Array<{
    key: string;
    label: string;
    score: number;
    maximum: number;
    reason: string;
  }>;
  riskReasons: string[];
};

export async function getOpportunityDetail(
  opportunityId: string,
): Promise<OpportunityDetail | null> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const cookieStore = await cookies();
    const record = parseDemoContentRecords(cookieStore.get("demo-content-records")?.value).find(
      (item) => item.opportunityId === opportunityId,
    );
    if (!record) return null;
    return {
      id: record.opportunityId,
      brandId: record.brandId,
      title: record.title,
      sourceType: record.sourceType,
      canonicalUrl: record.canonicalUrl,
      cleanText: record.cleanText ?? record.nucleus,
      language: record.language,
      createdAt: record.createdAt,
      valueNucleus: record.nucleus,
      score: record.score,
      riskPenalty: record.riskPenalty,
      status: "candidate",
      recommendedStyle: record.recommendedStyle,
      namedEntities: record.namedEntities,
      topicTags: record.topicTags,
      classificationReasons: record.classificationReasons,
      dimensions: record.dimensions.map((dimension) => ({
        ...dimension,
        label: dimensionLabels[dimension.key] ?? dimension.key,
        reason: "Deterministic preliminary signal; inspect the full production record for detail.",
      })),
      riskReasons: record.riskReasons,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select(
      "id,brand_id,value_nucleus,opportunity_score,risk_penalty,score_breakdown,status,recommended_style,created_at,source_documents(title,source_type,clean_text,language,canonical_url,metadata)",
    )
    .eq("id", opportunityId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load opportunity: ${error.message}`);
  if (!data) return null;
  const source = Array.isArray(data.source_documents)
    ? data.source_documents[0]
    : data.source_documents;
  const breakdown = opportunityScoreBreakdownSchema.parse(data.score_breakdown);
  const classification = z
    .object({
      namedEntities: z.array(z.string()).max(20).default([]),
      topicTags: z.array(z.string()).max(8).default([]),
      classificationReasons: z.array(z.string()).max(5).default([]),
    })
    .parse(source?.metadata ?? {});
  return {
    id: data.id,
    brandId: data.brand_id,
    title: source?.title ?? "Untitled source",
    sourceType: source?.source_type ?? "unknown",
    canonicalUrl: source?.canonical_url ?? undefined,
    cleanText: source?.clean_text ?? "",
    language: source?.language ?? "und",
    createdAt: data.created_at,
    valueNucleus: data.value_nucleus,
    score: Number(data.opportunity_score),
    riskPenalty: Number(data.risk_penalty),
    status: data.status,
    recommendedStyle: data.recommended_style ?? "perspective_conversation",
    namedEntities: classification.namedEntities,
    topicTags: classification.topicTags,
    classificationReasons: classification.classificationReasons,
    dimensions: Object.entries(breakdown.dimensions).map(([key, dimension]) => ({
      key,
      label: dimensionLabels[key] ?? key,
      score: dimension.score,
      maximum: dimension.maximum,
      reason: dimension.reason,
    })),
    riskReasons: breakdown.riskReasons,
  };
}
