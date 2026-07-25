import { demoBrands, demoOpportunities } from "./demo-data";
import { cookies } from "next/headers";
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

export async function getWorkspaceSnapshot(requestedBrandId?: string) {
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

  const { data: opportunities, error: opportunityError } = await supabase
    .from("opportunities")
    .select(
      "id,opportunity_score,value_nucleus,recommended_style,risk_penalty,created_at,source_documents(title,publisher),content_clusters(cluster_sources(count))",
    )
    .eq("brand_id", activeBrand.id)
    .neq("status", "archived")
    .order("opportunity_score", { ascending: false })
    .limit(20);

  if (opportunityError) {
    throw new Error(`Unable to load content opportunities: ${opportunityError.message}`);
  }

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
  };
}
