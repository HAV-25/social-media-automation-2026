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
  risk_penalty: number;
  score_breakdown: Record<string, unknown>;
};

export type OpportunityDetail = Opportunity & {
  source: {
    title: string;
    canonicalUrl: string;
    cleanText: string;
    language: string | null;
    wordCount: number | null;
  } | null;
  research: {
    id: string;
    summary: string;
    evidencePackage: Record<string, unknown>;
    model: string | null;
    promptVersion: string | null;
    completedAt: string | null;
    costUsd: number;
  } | null;
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
  imageValidation?: Record<string, unknown> | null;
  packagePath?: string | null;
  packageUrl?: string | null;
  score_breakdown?: Record<string, unknown>;
  scoreBreakdown?: Record<string, unknown>;
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

export type Activity = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const opportunitySchema = z.object({
  id: z.string().uuid(),
  value_nucleus: z.string(),
  opportunity_score: z.coerce.number().min(0).max(100),
  risk_penalty: z.coerce.number().min(0).max(100),
  score_breakdown: z.record(z.string(), z.unknown()).default({}),
  status: z.string(),
  recommended_style: z.string().nullable(),
  created_at: z.string(),
  source_document_id: z.string().uuid().nullable(),
});
const postSchema = z.object({
  id: z.string().uuid(),
  opportunity_id: z.string().uuid(),
  content_style: z.string(),
  tone: z.string(),
  status: z.string(),
  quality_score: z.coerce.number().nullable(),
  score_breakdown: z.record(z.string(), z.unknown()).default({}),
  current_version_id: z.string().uuid().nullable(),
  updated_at: z.string(),
});
const jobSchema = z.object({
  id: z.string().uuid(),
  pipeline_id: z.string().uuid(),
  stage: z.string(),
  state: z.string(),
  attempt: z.coerce.number().int().nonnegative(),
  max_attempts: z.coerce.number().int().positive(),
  cost_usd: z.coerce.number().nonnegative(),
  error_summary: z.string().nullable(),
  created_at: z.string(),
});
const activitySchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string().uuid().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
});

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export function manifestContainsDraftVersion(
  manifest: unknown,
  postDraftId: string,
  postVersionId: string,
): boolean {
  if (!manifest || typeof manifest !== "object") return false;
  const posts = (manifest as { posts?: unknown }).posts;
  if (!Array.isArray(posts)) return false;
  return posts.some(
    (post) =>
      post !== null &&
      typeof post === "object" &&
      String((post as Record<string, unknown>).id ?? "") === postDraftId &&
      String((post as Record<string, unknown>).current_version_id ?? "") === postVersionId,
  );
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
      "id,value_nucleus,opportunity_score,risk_penalty,score_breakdown,status,recommended_style,created_at,source_document_id",
    )
    .eq("brand_id", brandId)
    .order("opportunity_score", { ascending: false })
    .limit(100);
  throwIfError(error);
  const opportunities = z.array(opportunitySchema).parse(data ?? []) as Opportunity[];
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
      "id,opportunity_id,content_style,tone,status,quality_score,score_breakdown,current_version_id,updated_at",
    )
    .eq("brand_id", brandId)
    .eq("status", "ready_for_review")
    .order("updated_at", { ascending: false })
    .limit(100);
  throwIfError(error);
  const posts = z.array(postSchema).parse(data ?? []) as Post[];
  const versionIds = posts.flatMap((post) =>
    post.current_version_id ? [post.current_version_id] : [],
  );
  const draftIds = posts.map((post) => post.id);
  const opportunityIds = [...new Set(posts.map((post) => post.opportunity_id))];
  const [versions, images, packages] = await Promise.all([
    versionIds.length
      ? client.from("post_versions").select("id,hook,body,closing,full_text").in("id", versionIds)
      : Promise.resolve({ data: [], error: null }),
    draftIds.length
      ? client
          .from("image_assets")
          .select("post_draft_id,post_version_id,final_image_path,prompt,validation,created_at")
          .in("post_draft_id", draftIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    opportunityIds.length
      ? client
          .from("content_packages")
          .select("opportunity_id,storage_path,manifest,created_at")
          .eq("brand_id", brandId)
          .in("opportunity_id", opportunityIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  throwIfError(versions.error);
  throwIfError(images.error);
  throwIfError(packages.error);
  const byVersion = new Map((versions.data ?? []).map((version) => [String(version.id), version]));
  const byDraft = new Map<
    string,
    { path: string; prompt: string | null; validation: Record<string, unknown> | null }
  >();
  const currentVersionByDraft = new Map(posts.map((post) => [post.id, post.current_version_id]));
  for (const image of images.data ?? [])
    if (
      !byDraft.has(String(image.post_draft_id)) &&
      image.final_image_path &&
      image.post_version_id === currentVersionByDraft.get(String(image.post_draft_id))
    )
      byDraft.set(String(image.post_draft_id), {
        path: String(image.final_image_path),
        prompt: image.prompt ? String(image.prompt) : null,
        validation:
          image.validation && typeof image.validation === "object"
            ? (image.validation as Record<string, unknown>)
            : null,
      });
  const packageByDraftVersion = new Map<string, string>();
  for (const item of packages.data ?? []) {
    if (!item.storage_path) continue;
    for (const post of posts) {
      if (
        post.current_version_id &&
        manifestContainsDraftVersion(item.manifest, post.id, post.current_version_id)
      ) {
        const key = `${post.id}:${post.current_version_id}`;
        if (!packageByDraftVersion.has(key))
          packageByDraftVersion.set(key, String(item.storage_path));
      }
    }
  }
  const paths = [
    ...[...byDraft.values()].map((image) => image.path),
    ...packageByDraftVersion.values(),
  ];
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
      imageValidation: image?.validation ?? null,
      packagePath: post.current_version_id
        ? (packageByDraftVersion.get(`${post.id}:${post.current_version_id}`) ?? null)
        : null,
      packageUrl:
        post.current_version_id &&
        packageByDraftVersion.has(`${post.id}:${post.current_version_id}`)
          ? (urls.get(packageByDraftVersion.get(`${post.id}:${post.current_version_id}`)!) ?? null)
          : null,
      scoreBreakdown:
        post.score_breakdown && typeof post.score_breakdown === "object"
          ? (post.score_breakdown as Record<string, unknown>)
          : {},
    };
  });
}

export async function loadOpportunityDetail(
  client: SupabaseClient,
  opportunity: Opportunity,
): Promise<OpportunityDetail> {
  const [sourceResult, researchResult] = await Promise.all([
    opportunity.source_document_id
      ? client
          .from("source_documents")
          .select("title,canonical_url,clean_text,language")
          .eq("id", opportunity.source_document_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
    client
      .from("research_runs")
      .select("id,evidence_package,model,prompt_version,completed_at,cost_metadata,created_at")
      .eq("opportunity_id", opportunity.id)
      .eq("status", "succeeded")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  throwIfError(sourceResult.error);
  throwIfError(researchResult.error);
  const source = sourceResult.data;
  const research = researchResult.data;
  const evidence =
    research?.evidence_package && typeof research.evidence_package === "object"
      ? (research.evidence_package as Record<string, unknown>)
      : {};
  const cost =
    research?.cost_metadata && typeof research.cost_metadata === "object"
      ? Number((research.cost_metadata as Record<string, unknown>).estimatedCostUsd ?? 0)
      : 0;
  return {
    ...opportunity,
    source: source
      ? {
          title: String(source.title ?? "Untitled source"),
          canonicalUrl: String(source.canonical_url ?? ""),
          cleanText: String(source.clean_text ?? ""),
          language: source.language ? String(source.language) : null,
          wordCount: String(source.clean_text ?? "").trim()
            ? String(source.clean_text).trim().split(/\s+/).length
            : null,
        }
      : null,
    research: research
      ? {
          id: String(research.id),
          summary: String(evidence.summary ?? ""),
          evidencePackage: evidence,
          model: research.model ? String(research.model) : null,
          promptVersion: research.prompt_version ? String(research.prompt_version) : null,
          completedAt: research.completed_at ? String(research.completed_at) : null,
          costUsd: cost,
        }
      : null,
  };
}

export async function loadActivity(client: SupabaseClient, brandId: string): Promise<Activity[]> {
  const { data, error } = await client
    .from("audit_logs")
    .select("id,action,entity_type,entity_id,metadata,created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(200);
  throwIfError(error);
  return z.array(activitySchema).parse(data ?? []) as Activity[];
}

export async function loadJobs(client: SupabaseClient, brandId: string): Promise<Job[]> {
  const { data, error } = await client
    .from("pipeline_jobs")
    .select("id,pipeline_id,stage,state,attempt,max_attempts,cost_usd,error_summary,created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(200);
  throwIfError(error);
  return z.array(jobSchema).parse(data ?? []) as Job[];
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
  const payload = {
    ...input,
    idempotencyKey:
      typeof input.idempotencyKey === "string" ? input.idempotencyKey : crypto.randomUUID(),
  };
  const { error } = await client.rpc("request_lightweight_action", { payload });
  throwIfError(error);
}

export async function savePost(
  client: SupabaseClient,
  post: Post,
  idempotencyKey: string,
): Promise<void> {
  const { error } = await client.rpc("save_lightweight_post_edit", {
    payload: {
      postDraftId: post.id,
      expectedVersionId: post.current_version_id,
      idempotencyKey,
      hook: post.hook,
      body: post.body,
      closing: post.closing,
    },
  });
  throwIfError(error);
}

export async function reviewPost(
  client: SupabaseClient,
  postDraftId: string,
  decision: "approve" | "reject",
  reason: string,
  expectedVersionId: string | null,
  idempotencyKey: string,
): Promise<void> {
  const { error } = await client.rpc("review_lightweight_post", {
    payload: { postDraftId, decision, reason, expectedVersionId, idempotencyKey },
  });
  throwIfError(error);
}
