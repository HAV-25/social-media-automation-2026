import { NextResponse } from "next/server";
import { rssFeedPlanSchema } from "@content-engine/contracts";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { authenticateWorkflowRequest, WorkflowAuthError } from "@/lib/workflow-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await authenticateWorkflowRequest(request, "");
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("rss_feeds")
      .select(
        "id,name,feed_url,last_polled_at,rss_feed_brand_links(brand_id,generation_policy,minimum_score,daily_generation_limit,include_keywords,exclude_keywords)",
      )
      .eq("active", true)
      .order("name");

    if (error) throw error;

    const response = rssFeedPlanSchema.parse({
      contractVersion: "1.0",
      feeds: (data ?? []).map((feed) => ({
        brandLinks: (feed.rss_feed_brand_links ?? []).map((link) => ({
          brandId: link.brand_id,
          dailyGenerationLimit: link.daily_generation_limit,
          generationPolicy: link.generation_policy,
          includeKeywords: link.include_keywords,
          excludeKeywords: link.exclude_keywords,
          minimumScore: Number(link.minimum_score),
        })),
        feedId: feed.id,
        feedUrl: feed.feed_url,
        lastPolledAt: feed.last_polled_at,
        name: feed.name,
      })),
    });

    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof WorkflowAuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: { code: "feed_plan_failed", message: "Unable to build the RSS feed plan." } },
      { status: 500 },
    );
  }
}
