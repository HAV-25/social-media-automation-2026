import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const brandSchema = z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() });
export type Brand = z.infer<typeof brandSchema>;

export type Opportunity = {
  id: string;
  value_nucleus: string;
  opportunity_score: number;
  status: string;
  recommended_style: string | null;
  created_at: string;
  source_document_id: string | null;
  sourceTitle?: string;
};

export type Post = {
  id: string;
  opportunity_id: string;
  content_style: string;
  tone: string;
  status: string;
  quality_score: number | null;
  current_version_id: string | null;
  updated_at: string;
  hook?: string;
  body?: string;
  closing?: string | null;
  fullText?: string;
  imagePath?: string | null;
  imageUrl?: string | null;
  imagePrompt?: string | null;
};

export type Job = {
  id: string;
  pipeline_id: string;
  stage: string;
  state: string;
  attempt: number;
  max_attempts: number;
  cost_usd: number;
  error_summary: string | null;
  created_at: string;
};

export type Feed = {
  id: string;
  name: string;
  feed_url: string;
  active: boolean;
  authority_score: number;
  last_polled_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  minimumScore: number;
  dailyLimit: number;
  includeKeywords: string[];
  excludeKeywords: string[];
};

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function loadBrands(client: SupabaseClient): Promise<Brand[]> {
  const { data, error } = await client
    .from("brands")
    .select("id,name,slug")
    .eq("status", "active")
    .order("name");
  throwIfError(error);
  return z.array(brandSchema).parse(data ?? []);
}

export async function loadOpportunities(
  client: SupabaseClient,
  brandId: string,
): Promise<Opportunity[]> {
  const { data, error } = await client
    .from("opportunities")
    .select(
      "id,value_nucleus,opportunity_score,status,recommended_style,created_at,source_document_id",
    )
    .eq("brand_id", brandId)
    .order("opportunity_score", { ascending: false })
    .limit(100);
  throwIfError(error);
  const opportunities = (data ?? []) as Opportunity[];
  const sourceIds = opportunities.flatMap((item) =>
    item.source_document_id ? [item.source_document_id] : [],
  );
  if (!sourceIds.length) return opportunities;
  const sources = await client.from("source_documents").select("id,title").in("id", sourceIds);
  throwIfError(sources.error);
  const titles = new Map(
    (sources.data ?? []).map((source) => [
      String(source.id),
      String(source.title ?? "Untitled source"),
    ]),
  );
  return opportunities.map((item) => ({
    ...item,
    sourceTitle: item.source_document_id ? titles.get(item.source_document_id) : undefined,
  }));
}

export async function loadPosts(client: SupabaseClient, brandId: string): Promise<Post[]> {
  const { data, error } = await client
    .from("post_drafts")
    .select(
      "id,opportunity_id,content_style,tone,status,quality_score,current_version_id,updated_at",
    )
    .eq("brand_id", brandId)
    .order("updated_at", { ascending: false })
    .limit(100);
  throwIfError(error);
  const posts = (data ?? []) as Post[];
  const versionIds = posts.flatMap((post) =>
    post.current_version_id ? [post.current_version_id] : [],
  );
  const draftIds = posts.map((post) => post.id);
  const [versions, images] = await Promise.all([
    versionIds.length
      ? client.from("post_versions").select("id,hook,body,closing,full_text").in("id", versionIds)
      : Promise.resolve({ data: [], error: null }),
    draftIds.length
      ? client
          .from("image_assets")
          .select("post_draft_id,final_image_path,prompt,created_at")
          .in("post_draft_id", draftIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  throwIfError(versions.error);
  throwIfError(images.error);
  const byVersion = new Map((versions.data ?? []).map((version) => [String(version.id), version]));
  const byDraft = new Map<string, { path: string; prompt: string | null }>();
  for (const image of images.data ?? [])
    if (!byDraft.has(String(image.post_draft_id)) && image.final_image_path)
      byDraft.set(String(image.post_draft_id), {
        path: String(image.final_image_path),
        prompt: image.prompt ? String(image.prompt) : null,
      });
  const paths = [...byDraft.values()].map((image) => image.path);
  const signed = paths.length
    ? await client.storage.from("generated-images").createSignedUrls(paths, 900)
    : { data: [], error: null };
  throwIfError(signed.error);
  const urls = new Map(
    (signed.data ?? []).map((item, index) => [paths[index], item.signedUrl ?? null]),
  );
  return posts.map((post) => {
    const version = post.current_version_id ? byVersion.get(post.current_version_id) : undefined;
    const image = byDraft.get(post.id);
    return {
      ...post,
      hook: String(version?.hook ?? ""),
      body: String(version?.body ?? ""),
      closing: version?.closing ? String(version.closing) : null,
      fullText: String(version?.full_text ?? ""),
      imagePath: image?.path ?? null,
      imageUrl: image ? (urls.get(image.path) ?? null) : null,
      imagePrompt: image?.prompt ?? null,
    };
  });
}

export async function loadJobs(client: SupabaseClient, brandId: string): Promise<Job[]> {
  const { data, error } = await client
    .from("pipeline_jobs")
    .select("id,pipeline_id,stage,state,attempt,max_attempts,cost_usd,error_summary,created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(200);
  throwIfError(error);
  return (data ?? []) as Job[];
}

export async function loadFeeds(client: SupabaseClient, brandId: string): Promise<Feed[]> {
  const { data, error } = await client
    .from("rss_feeds")
    .select(
      "id,name,feed_url,active,authority_score,last_polled_at,last_success_at,last_error,consecutive_failures,rss_feed_brand_links!inner(brand_id,minimum_score,daily_generation_limit,include_keywords,exclude_keywords)",
    )
    .eq("rss_feed_brand_links.brand_id", brandId)
    .order("name");
  throwIfError(error);
  return (data ?? []).map((row) => {
    const links = Array.isArray(row.rss_feed_brand_links)
      ? row.rss_feed_brand_links
      : [row.rss_feed_brand_links];
    const link = (links[0] ?? {}) as Record<string, unknown>;
    return {
      id: String(row.id),
      name: String(row.name),
      feed_url: String(row.feed_url),
      active: Boolean(row.active),
      authority_score: Number(row.authority_score),
      last_polled_at: row.last_polled_at ? String(row.last_polled_at) : null,
      last_success_at: row.last_success_at ? String(row.last_success_at) : null,
      last_error: row.last_error ? String(row.last_error) : null,
      consecutive_failures: Number(row.consecutive_failures),
      minimumScore: Number(link.minimum_score ?? 75),
      dailyLimit: Number(link.daily_generation_limit ?? 3),
      includeKeywords: Array.isArray(link.include_keywords)
        ? link.include_keywords.map(String)
        : [],
      excludeKeywords: Array.isArray(link.exclude_keywords)
        ? link.exclude_keywords.map(String)
        : [],
    };
  });
}

export async function manageFeed(
  client: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.rpc("manage_lightweight_feed", { payload });
  throwIfError(error);
}

export async function requestAction(
  client: SupabaseClient,
  input: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.rpc("request_lightweight_action", { payload: input });
  throwIfError(error);
}

export async function savePost(client: SupabaseClient, post: Post): Promise<void> {
  const { error } = await client.rpc("save_lightweight_post_edit", {
    payload: { postDraftId: post.id, hook: post.hook, body: post.body, closing: post.closing },
  });
  throwIfError(error);
}

export async function reviewPost(
  client: SupabaseClient,
  postDraftId: string,
  decision: "approve" | "reject",
  reason: string,
): Promise<void> {
  const { error } = await client.rpc("review_lightweight_post", {
    payload: { postDraftId, decision, reason },
  });
  throwIfError(error);
}
