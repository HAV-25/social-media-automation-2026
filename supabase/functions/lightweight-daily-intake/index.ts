import { createClient } from "npm:@supabase/supabase-js@2.53.0";
import { z } from "npm:zod@4.0.17";
import {
  classify,
  clusterKey,
  parseRss,
  safeFetchText,
  scoreOpportunity,
  sha256,
  stripMarkup,
} from "../_shared/rss-runtime.ts";
import {
  jsonResponse,
  requireWorkerSecret,
  safeErrorResponse,
  WorkerHttpError,
} from "../_shared/worker-auth.ts";

const requestSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    correlationId: z.uuid().optional(),
    brandId: z.uuid().optional(),
    maxItemsPerFeed: z.number().int().min(1).max(10).default(3),
  })
  .strict();
const linkSchema = z.object({
  brand_id: z.uuid(),
  generation_policy: z.string(),
  minimum_score: z.coerce.number(),
  daily_generation_limit: z.number().int(),
  include_keywords: z.array(z.string()),
  exclude_keywords: z.array(z.string()),
  brands: z
    .object({
      brand_profiles: z
        .object({
          audience_definition: z.string().nullable(),
          positioning: z.string().nullable(),
          content_pillars: z.array(z.string()),
          restricted_topics: z.array(z.string()),
        })
        .nullable(),
    })
    .nullable(),
});
const feedSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  name: z.string(),
  feed_url: z.url(),
  created_by: z.uuid().nullable(),
  rss_feed_brand_links: z.array(linkSchema),
});

function matchesRoute(text: string, link: z.infer<typeof linkSchema>): boolean {
  const lower = text.toLocaleLowerCase("en");
  return (
    (!link.include_keywords.length ||
      link.include_keywords.some((word) => lower.includes(word.toLocaleLowerCase("en")))) &&
    !link.exclude_keywords.some((word) => lower.includes(word.toLocaleLowerCase("en")))
  );
}

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST")
      throw new WorkerHttpError(405, "method_not_allowed", "POST is required.");
    requireWorkerSecret(request);
    const input = requestSchema.parse(await request.json());
    const correlationId = input.correlationId ?? crypto.randomUUID();
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key)
      throw new WorkerHttpError(
        500,
        "supabase_environment_missing",
        "Worker database environment is unavailable.",
      );
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let query = supabase
      .from("rss_feeds")
      .select(
        "id,organization_id,name,feed_url,created_by,rss_feed_brand_links(brand_id,generation_policy,minimum_score,daily_generation_limit,include_keywords,exclude_keywords,brands(brand_profiles(audience_definition,positioning,content_pillars,restricted_topics)))",
      )
      .eq("active", true)
      .order("name");
    if (input.brandId) query = query.eq("rss_feed_brand_links.brand_id", input.brandId);
    const feedsResult = await query;
    if (feedsResult.error) throw feedsResult.error;
    const feeds = z.array(feedSchema).parse(feedsResult.data ?? []);
    const outcome: Array<Record<string, unknown>> = [];
    for (const feed of feeds) {
      try {
        const fetched = await safeFetchText(feed.feed_url);
        const items = parseRss(fetched.text).slice(0, input.maxItemsPerFeed);
        let actorId = feed.created_by;
        if (!actorId) {
          const actor = await supabase
            .from("organization_members")
            .select("user_id")
            .eq("organization_id", feed.organization_id)
            .eq("role", "administrator")
            .order("created_at")
            .limit(1)
            .maybeSingle();
          if (actor.error) throw actor.error;
          actorId = actor.data?.user_id ?? null;
        }
        if (!actorId)
          throw new WorkerHttpError(
            422,
            "rss_actor_unavailable",
            "Feed has no organization administrator.",
          );
        const itemOutcomes: Array<Record<string, unknown>> = [];
        for (const item of items) {
          const summary = stripMarkup(item.summary ?? "");
          const identityText = `${item.title}\n${summary}`;
          const contentHash = await sha256(identityText);
          const intake = await supabase.rpc("ingest_rss_item", {
            payload: {
              contractVersion: "1.0",
              correlationId,
              idempotencyKey: `lw-rss:${feed.id}:${await sha256(item.guid)}`,
              feedId: feed.id,
              guid: item.guid,
              canonicalUrl: item.canonicalUrl,
              title: item.title,
              author: item.author,
              publishedAt: item.publishedAt,
              summary,
              contentHash,
            },
          });
          if (intake.error) throw intake.error;
          const intakeData = z
            .object({ sourceDocumentId: z.uuid(), duplicate: z.boolean() })
            .passthrough()
            .parse(intake.data);
          let article = summary;
          if (item.canonicalUrl) {
            try {
              const page = await safeFetchText(item.canonicalUrl);
              const extracted = stripMarkup(page.text);
              if (extracted.length >= 200) article = extracted;
            } catch {
              /* bounded fallback to RSS summary */
            }
          }
          if (article.length < 20) {
            itemOutcomes.push({ title: item.title, decision: "too_short" });
            continue;
          }
          for (const link of feed.rss_feed_brand_links) {
            if (input.brandId && link.brand_id !== input.brandId) continue;
            if (!matchesRoute(identityText, link)) {
              itemOutcomes.push({
                title: item.title,
                brandId: link.brand_id,
                decision: "filtered",
              });
              continue;
            }
            const profile = link.brands?.brand_profiles;
            if (!profile) {
              itemOutcomes.push({
                title: item.title,
                brandId: link.brand_id,
                decision: "brand_profile_missing",
              });
              continue;
            }
            const policy = {
              audienceDefinition: profile.audience_definition ?? "",
              positioning: profile.positioning ?? "",
              contentPillars: profile.content_pillars,
              restrictedTopics: profile.restricted_topics,
            };
            const scored = scoreOpportunity(article, policy);
            const classification = classify(article, policy);
            const qualified = await supabase.rpc("qualify_lightweight_source", {
              payload: {
                contractVersion: "1.0",
                correlationId,
                actorId,
                feedId: feed.id,
                brandId: link.brand_id,
                sourceDocumentId: intakeData.sourceDocumentId,
                cleanText: article,
                language: "en",
                extractionConfidence: article === summary ? 0.65 : 0.9,
                valueNucleus: article.slice(0, 300),
                canonicalTopic: item.title,
                clusterKey: await clusterKey(item.title),
                score: scored.finalScore,
                riskPenalty: scored.riskPenalty,
                scoreBreakdown: scored,
                classification,
              },
            });
            if (qualified.error) throw qualified.error;
            itemOutcomes.push({
              title: item.title,
              brandId: link.brand_id,
              duplicate: intakeData.duplicate,
              ...(Array.isArray(qualified.data) ? qualified.data[0] : qualified.data),
            });
          }
        }
        await supabase
          .from("rss_feeds")
          .update({
            last_polled_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
            last_error: null,
            consecutive_failures: 0,
          })
          .eq("id", feed.id);
        outcome.push({
          feedId: feed.id,
          feedName: feed.name,
          status: "completed",
          items: itemOutcomes,
        });
      } catch (error) {
        const current = await supabase
          .from("rss_feeds")
          .select("consecutive_failures")
          .eq("id", feed.id)
          .maybeSingle();
        await supabase
          .from("rss_feeds")
          .update({
            last_polled_at: new Date().toISOString(),
            last_error: error instanceof Error ? error.message.slice(0, 500) : "Feed failed",
            consecutive_failures: Number(current.data?.consecutive_failures ?? 0) + 1,
          })
          .eq("id", feed.id);
        outcome.push({
          feedId: feed.id,
          feedName: feed.name,
          status: "failed",
          errorCode: error instanceof WorkerHttpError ? error.code : "feed_processing_failed",
        });
      }
    }
    return jsonResponse({ contractVersion: "1.0", correlationId, feeds: outcome });
  } catch (error) {
    return safeErrorResponse(error);
  }
});
