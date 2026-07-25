import "server-only";
import { serverEnvSchema } from "@content-engine/contracts";
import { demoBrands, demoOpportunities } from "./demo-data";
import { cookies } from "next/headers";
import { cache } from "react";
import { z } from "zod";
import { parseDemoContentRecords } from "./demo-content-store";
import { createSupabaseServerClient } from "./supabase/server";

export type WorkspaceBrand = {
  id: string;
  name: string;
  slug: string;
  color?: string;
};

export type WorkspaceOpportunity = {
  id: string;
  score: number;
  source: string;
  age: string;
  title: string;
  nucleus: string;
  style: string;
  corroboration: number;
  risk: string;
};

const dashboardMetricsRowSchema = z
  .object({
    sources_today: z.coerce.number().int().nonnegative(),
    normalized_today: z.coerce.number().int().nonnegative(),
    active_opportunities: z.coerce.number().int().nonnegative(),
    research_spend_usd: z.coerce.number().nonnegative(),
    deduplicated_today: z.coerce.number().int().nonnegative(),
    processing_today: z.coerce.number().int().nonnegative(),
    completed_today: z.coerce.number().int().nonnegative(),
  })
  .strict();

export type DashboardMetrics = {
  sourcesToday: number;
  normalizedToday: number;
  activeOpportunities: number;
  researchSpendUsd: number;
  dailyResearchBudgetUsd: number;
  deduplicatedToday: number;
  processingToday: number;
  completedToday: number;
  since: string;
};

function relativeAge(value: string) {
  const elapsedMinutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (elapsedMinutes < 60) return `${elapsedMinutes} min`;
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hr`;
  return `${Math.round(elapsedHours / 24)} d`;
}

function styleLabel(style: string | null) {
  const labels: Record<string, string> = {
    educational_breakdown: "Educational",
    newsworthy_authority: "Newsworthy",
    perspective_conversation: "Perspective",
  };
  return style ? (labels[style] ?? style) : "Perspective";
}

export const getWorkspaceSnapshot = cache(async function getWorkspaceSnapshot(
  requestedBrandId?: string,
) {
  const env = serverEnvSchema.parse(process.env);
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const fallbackBrand = demoBrands[0];
    if (!fallbackBrand) throw new Error("Demo mode requires at least one brand.");
    const activeBrand =
      demoBrands.find((brand) => brand.id === requestedBrandId) ??
      demoBrands.find((brand) => brand.name === "Business of AI") ??
      fallbackBrand;
    const cookieStore = await cookies();
    const submitted = parseDemoContentRecords(cookieStore.get("demo-content-records")?.value)
      .filter((record) => record.brandId === activeBrand.id)
      .map(
        (record) =>
          ({
            id: record.opportunityId,
            score: record.score,
            source: "Original input",
            age: relativeAge(record.createdAt),
            title: record.title,
            nucleus: record.nucleus,
            style: "Perspective",
            corroboration: 1,
            risk: record.riskPenalty >= 15 ? "Review" : "Low",
          }) satisfies WorkspaceOpportunity,
      );

    return {
      activeBrand,
      brands: [...demoBrands],
      opportunities: [...submitted, ...demoOpportunities],
      dashboardMetrics: {
        sourcesToday: submitted.length,
        normalizedToday: submitted.length,
        activeOpportunities: submitted.length + demoOpportunities.length,
        researchSpendUsd: 0,
        dailyResearchBudgetUsd: env.AI_DAILY_BUDGET_USD,
        deduplicatedToday: 0,
        processingToday: 0,
        completedToday: submitted.length,
        since: since.toISOString(),
      } satisfies DashboardMetrics,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: brands, error: brandError } = await supabase
    .from("brands")
    .select("id,name,slug")
    .eq("status", "active")
    .order("name");

  if (brandError) throw new Error(`Unable to load assigned brands: ${brandError.message}`);
  if (!brands?.length) throw new Error("This account has no assigned brands.");
  const fallbackBrand = brands[0];
  if (!fallbackBrand) throw new Error("This account has no assigned brands.");

  const activeBrand =
    brands.find((brand) => brand.id === requestedBrandId) ??
    brands.find((brand) => brand.name === "Business of AI") ??
    fallbackBrand;

  const [
    { data: opportunities, error: opportunityError },
    { data: metricRows, error: metricsError },
  ] = await Promise.all([
    supabase
      .from("opportunities")
      .select(
        "id,opportunity_score,value_nucleus,recommended_style,risk_penalty,created_at,source_documents(title,publisher),content_clusters(cluster_sources(count))",
      )
      .eq("brand_id", activeBrand.id)
      .neq("status", "archived")
      .order("opportunity_score", { ascending: false })
      .limit(20),
    supabase.rpc("get_brand_dashboard_metrics", {
      p_brand_id: activeBrand.id,
      p_since: since.toISOString(),
    }),
  ]);

  if (opportunityError) {
    throw new Error(`Unable to load content opportunities: ${opportunityError.message}`);
  }
  if (metricsError) throw new Error("Unable to load brand dashboard metrics.");
  const metrics = dashboardMetricsRowSchema.parse(metricRows?.[0]);

  return {
    activeBrand,
    brands,
    opportunities: (opportunities ?? []).map((opportunity) => {
      const source = Array.isArray(opportunity.source_documents)
        ? opportunity.source_documents[0]
        : opportunity.source_documents;
      const cluster = Array.isArray(opportunity.content_clusters)
        ? opportunity.content_clusters[0]
        : opportunity.content_clusters;
      const sourceCount = cluster?.cluster_sources?.[0]?.count;

      return {
        id: opportunity.id,
        score: Number(opportunity.opportunity_score),
        source: source?.publisher ?? "Submitted source",
        age: relativeAge(opportunity.created_at),
        title: source?.title ?? "Untitled content opportunity",
        nucleus: opportunity.value_nucleus,
        style: styleLabel(opportunity.recommended_style),
        corroboration: Number(sourceCount ?? 1),
        risk: Number(opportunity.risk_penalty) >= 20 ? "Review" : "Low",
      } satisfies WorkspaceOpportunity;
    }),
    dashboardMetrics: {
      sourcesToday: metrics.sources_today,
      normalizedToday: metrics.normalized_today,
      activeOpportunities: metrics.active_opportunities,
      researchSpendUsd: metrics.research_spend_usd,
      dailyResearchBudgetUsd: env.AI_DAILY_BUDGET_USD,
      deduplicatedToday: metrics.deduplicated_today,
      processingToday: metrics.processing_today,
      completedToday: metrics.completed_today,
      since: since.toISOString(),
    } satisfies DashboardMetrics,
  };
});
