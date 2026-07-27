"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getBrandArchivePolicy } from "@/lib/brand-archive-policy";
import { canReviewContent } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const resurfaceInputSchema = z.object({
  brandId: z.uuid(),
  itemId: z.uuid(),
  opportunityId: z.uuid(),
});

export async function resurfaceRssItem(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!canReviewContent(user.role)) {
    redirect("/archive?error=Reviewer+access+is+required+to+resurface+an+article.");
  }
  const parsed = resurfaceInputSchema.safeParse({
    brandId: String(formData.get("brandId") ?? ""),
    itemId: String(formData.get("itemId") ?? ""),
    opportunityId: String(formData.get("opportunityId") ?? ""),
  });
  if (!parsed.success) redirect("/archive?error=The+archive+selection+was+invalid.");
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    redirect("/archive?error=Connect+Supabase+to+resurface+durable+articles.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunities")
    .select("id,organization_id,brand_id,source_document_id")
    .eq("id", parsed.data.opportunityId)
    .eq("brand_id", parsed.data.brandId)
    .eq("organization_id", user.organizationId)
    .maybeSingle();
  if (opportunityError || !opportunity?.source_document_id) {
    redirect("/archive?error=The+article+is+not+available+for+manual+review.");
  }
  const { data: item, error: itemError } = await supabase
    .from("rss_feed_items")
    .select("id,rss_feed_id,source_document_id")
    .eq("id", parsed.data.itemId)
    .eq("organization_id", user.organizationId)
    .eq("source_document_id", opportunity.source_document_id)
    .maybeSingle();
  if (itemError || !item) redirect("/archive?error=The+archived+article+was+not+found.");
  const { data: route, error: routeError } = await supabase
    .from("rss_feed_brand_links")
    .select("brand_id")
    .eq("rss_feed_id", item.rss_feed_id)
    .eq("brand_id", parsed.data.brandId)
    .eq("organization_id", user.organizationId)
    .maybeSingle();
  if (routeError || !route) {
    redirect("/archive?error=This+feed+is+no+longer+routed+to+the+selected+brand.");
  }

  const resurfacedAt = new Date().toISOString();
  const archivePolicy = await getBrandArchivePolicy(parsed.data.brandId);
  const { error: stateError } = await supabase.from("rss_item_review_states").upsert(
    {
      organization_id: user.organizationId,
      brand_id: parsed.data.brandId,
      rss_feed_item_id: parsed.data.itemId,
      resurfaced_at: resurfacedAt,
      resurfaced_by: user.id,
    },
    { onConflict: "brand_id,rss_feed_item_id" },
  );
  if (stateError) {
    redirect(`/archive?error=${encodeURIComponent("The article could not be resurfaced.")}`);
  }
  const { error: auditError } = await supabase.from("audit_logs").insert({
    organization_id: user.organizationId,
    brand_id: parsed.data.brandId,
    actor_id: user.id,
    action: "rss_item.resurfaced",
    entity_type: "rss_feed_item",
    entity_id: parsed.data.itemId,
    metadata: {
      opportunityId: parsed.data.opportunityId,
      activeUntil: new Date(
        Date.parse(resurfacedAt) + archivePolicy.resurfaceWindowHours * 60 * 60 * 1000,
      ).toISOString(),
      reviewWindowHours: archivePolicy.resurfaceWindowHours,
    },
  });
  if (auditError) {
    redirect(
      "/archive?error=The+article+was+resurfaced+but+its+audit+event+could+not+be+recorded.",
    );
  }

  revalidatePath("/");
  revalidatePath("/archive");
  redirect(`/opportunities/${parsed.data.opportunityId}?resurfaced=true`);
}
