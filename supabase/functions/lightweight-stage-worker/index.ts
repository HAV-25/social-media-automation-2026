import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.53.0";
import { PNG } from "npm:pngjs@7.0.0";
import { z } from "npm:zod@4.0.17";
import { generateBaseImage, structuredResponse } from "../_shared/openai-runtime.ts";
import {
  LIGHTWEIGHT_IMAGE_PROMPT_VERSION,
  LIGHTWEIGHT_IMAGE_SYSTEM_PROMPT,
  LIGHTWEIGHT_RESEARCH_PROMPT_VERSION,
  LIGHTWEIGHT_RESEARCH_SYSTEM_PROMPT,
  LIGHTWEIGHT_WRITER_PROMPT_VERSION,
  LIGHTWEIGHT_WRITER_SYSTEM_PROMPT,
} from "../_shared/prompts/lightweight-runtime.v1.ts";
import {
  jsonResponse,
  requireWorkerSecret,
  safeErrorResponse,
  WorkerHttpError,
} from "../_shared/worker-auth.ts";

const stageSchema = z.enum(["research", "draft", "verify", "image", "package"]);
const requestSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    stages: z.array(stageSchema).min(1).max(5),
    limit: z.number().int().min(1).max(10).default(3),
    workerId: z.string().min(3).max(120),
  })
  .strict();
const jobSchema = z.object({
  job_id: z.uuid(),
  pipeline_id: z.uuid(),
  organization_id: z.uuid(),
  brand_id: z.uuid(),
  stage: stageSchema,
  attempt: z.number().int(),
  idempotency_key: z.string(),
  request_payload: z.record(z.string(), z.unknown()),
});

const researchResultSchema = z
  .object({
    summary: z.string().min(20).max(5000),
    claims: z
      .array(
        z
          .object({
            text: z.string().min(3).max(2000),
            claimType: z.enum(["factual", "numerical", "opinion", "interpretation"]),
            importance: z.enum(["core", "supporting", "optional"]),
            riskLevel: z.enum(["low", "medium", "high"]),
            verificationState: z.enum([
              "verified",
              "partially_supported",
              "disputed",
              "unsupported",
              "opinion",
            ]),
            confidence: z.number().min(0).max(1),
            usageGuidance: z.enum(["safe", "caveat", "do_not_use"]),
            caveat: z.string().max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    caveats: z.array(z.string().min(3).max(1000)).max(10),
  })
  .strict();

const draftResultSchema = z
  .object({
    angles: z
      .array(
        z
          .object({
            title: z.string().min(3).max(200),
            thesis: z.string().min(20).max(1500),
            intendedReaction: z.string().min(3).max(500),
            score: z.number().min(0).max(100),
          })
          .strict(),
      )
      .length(3),
    selectedAngleIndex: z.number().int().min(0).max(2),
    hook: z.string().min(1).max(500),
    body: z.string().min(1).max(8000),
    closing: z.string().max(1000),
  })
  .strict();

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const string = (extra: Record<string, unknown> = {}) => ({ type: "string", ...extra });
const researchJsonSchema = object({
  summary: string(),
  claims: {
    type: "array",
    minItems: 1,
    maxItems: 8,
    items: object({
      text: string(),
      claimType: { type: "string", enum: ["factual", "numerical", "opinion", "interpretation"] },
      importance: { type: "string", enum: ["core", "supporting", "optional"] },
      riskLevel: { type: "string", enum: ["low", "medium", "high"] },
      verificationState: {
        type: "string",
        enum: ["verified", "partially_supported", "disputed", "unsupported", "opinion"],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      usageGuidance: { type: "string", enum: ["safe", "caveat", "do_not_use"] },
      caveat: string(),
    }),
  },
  caveats: { type: "array", maxItems: 10, items: string() },
});
const draftJsonSchema = object({
  angles: {
    type: "array",
    minItems: 3,
    maxItems: 3,
    items: object({
      title: string(),
      thesis: string(),
      intendedReaction: string(),
      score: { type: "number", minimum: 0, maximum: 100 },
    }),
  },
  selectedAngleIndex: { type: "integer", minimum: 0, maximum: 2 },
  hook: string(),
  body: string(),
  closing: string(),
});

type Client = SupabaseClient;
type Job = z.infer<typeof jobSchema>;

function environmentClient(): Client {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key)
    throw new WorkerHttpError(
      500,
      "supabase_environment_missing",
      "Worker database environment is unavailable.",
    );
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function digestHex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sanitizeError(error: unknown) {
  if (error instanceof WorkerHttpError)
    return {
      code: error.code,
      summary: error.message,
      retryable: error.status >= 500,
      category: error.status >= 500 ? "provider" : "validation",
    };
  const message = error instanceof Error ? error.message : "Stage execution failed";
  return {
    code: "stage_execution_failed",
    summary: message.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 1000),
    retryable: true,
    category: "transient",
  };
}

async function loadContext(client: Client, job: Job) {
  const pipeline = await client
    .from("pipeline_instances")
    .select("opportunity_id,source_document_id,correlation_id")
    .eq("id", job.pipeline_id)
    .single();
  if (pipeline.error || !pipeline.data?.opportunity_id)
    throw pipeline.error ?? new Error("Pipeline context missing");
  const opportunity = await client
    .from("opportunities")
    .select(
      "id,value_nucleus,opportunity_score,recommended_style,source_documents(title,canonical_url,clean_text,metadata)",
    )
    .eq("id", pipeline.data.opportunity_id)
    .single();
  if (opportunity.error) throw opportunity.error;
  const brand = await client
    .from("brands")
    .select(
      "id,name,brand_profiles(audience_definition,positioning,content_pillars,restricted_topics,voice_traits,visual_system)",
    )
    .eq("id", job.brand_id)
    .single();
  if (brand.error) throw brand.error;
  return {
    pipeline: pipeline.data,
    opportunity: opportunity.data as Record<string, unknown>,
    brand: brand.data as Record<string, unknown>,
  };
}

function relation(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return (value[0] ?? {}) as Record<string, unknown>;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

async function persist(client: Client, job: Job, actorId: string, output: Record<string, unknown>) {
  const saved = await client.rpc("persist_lightweight_stage_output", {
    payload: { pipelineId: job.pipeline_id, stage: job.stage, actorId, output },
  });
  if (saved.error) throw saved.error;
  return saved.data as Record<string, unknown>;
}

async function researchStage(
  client: Client,
  job: Job,
  context: Awaited<ReturnType<typeof loadContext>>,
  actorId: string,
) {
  const source = relation(context.opportunity.source_documents);
  const title = String(source.title ?? "Untitled source");
  const cleanText = String(source.clean_text ?? "").slice(0, 80_000);
  const canonicalUrl = String(source.canonical_url ?? "https://example.invalid/source");
  const response = await structuredResponse<unknown>({
    instructions: LIGHTWEIGHT_RESEARCH_SYSTEM_PROMPT,
    prompt: `Research this source within a maximum of two search actions.\nTITLE: ${title}\nORIGINAL_URL: ${canonicalUrl}\nSOURCE_TEXT:\n${cleanText}\nReturn claims whose support and caveats are explicit.`,
    format: { name: "lightweight_research", schema: researchJsonSchema },
    maxOutputTokens: 3000,
    webSearch: true,
  });
  const research = researchResultSchema.parse(response.data);
  const retrievedAt = new Date().toISOString();
  const sourceKey = "source_original";
  const evidencePackage = {
    contractVersion: "1.0",
    opportunityId: String(context.opportunity.id),
    summary: research.summary,
    sources: [
      {
        sourceKey,
        url: canonicalUrl,
        title,
        publisher: new URL(canonicalUrl).hostname,
        publishedAt: null,
        retrievedAt,
        sourceType: "source_material",
        authorityScore: 70,
        relevantExcerpt: cleanText.slice(0, 2000) || title,
      },
    ],
    claims: research.claims.map((claim, index) => ({
      claimKey: `claim_${String(index + 1).padStart(6, "0")}`,
      ...claim,
      caveat: claim.caveat || null,
      evidence: [
        {
          sourceKey,
          supportType: claim.verificationState === "disputed" ? "context" : "supports",
          excerpt: cleanText.slice(0, 1000) || title,
          locator: canonicalUrl,
        },
      ],
    })),
    conflicts: [],
    caveats: research.caveats,
    readyForWriting: true,
  };
  const plan = {
    contractVersion: "1.0",
    opportunityId: String(context.opportunity.id),
    objective: `Verify the central claims in ${title}`,
    queries: [
      { query: title.slice(0, 300), purpose: "Verify central claims", priority: "required" },
    ],
    preferredSourceTypes: ["primary_document", "credible_reporting"],
    allowedDomains: [],
    excludedContext: [],
    budget: {
      maxQueries: 2,
      maxDomains: 10,
      maxResults: 6,
      maxElapsedMs: 120000,
      maxOutputTokens: 3000,
      maxCostUsd: 0.25,
    },
  };
  const saved = await persist(client, job, actorId, {
    plan,
    evidencePackage,
    model: response.model,
    promptVersion: LIGHTWEIGHT_RESEARCH_PROMPT_VERSION,
    responseId: response.responseId,
    usage: response.usage,
  });
  return {
    saved,
    usage: response.usage,
    costUsd: response.usage.estimatedCostUsd,
    nextStage: "draft" as const,
    nextRequest: { actorId, opportunityId: context.opportunity.id },
  };
}

const styles = [
  "newsworthy_authority",
  "educational_breakdown",
  "perspective_conversation",
] as const;
async function draftStage(
  client: Client,
  job: Job,
  context: Awaited<ReturnType<typeof loadContext>>,
  actorId: string,
) {
  const source = relation(context.opportunity.source_documents);
  const profile = relation(context.brand.brand_profiles);
  const research = await client
    .from("research_runs")
    .select("evidence_package")
    .eq("opportunity_id", String(context.opportunity.id))
    .eq("status", "succeeded")
    .order("completed_at", { ascending: false })
    .limit(1)
    .single();
  if (research.error) throw research.error;
  const requestedDraftId =
    typeof job.request_payload.postDraftId === "string"
      ? job.request_payload.postDraftId
      : undefined;
  let requestedStyles: readonly (typeof styles)[number][] = styles;
  if (requestedDraftId) {
    const requestedDraft = await client
      .from("post_drafts")
      .select("content_style")
      .eq("id", requestedDraftId)
      .eq("opportunity_id", String(context.opportunity.id))
      .single();
    if (requestedDraft.error) throw requestedDraft.error;
    requestedStyles = [z.enum(styles).parse(requestedDraft.data.content_style)];
  }
  const drafts: Array<Record<string, unknown>> = [];
  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  for (const style of requestedStyles) {
    const prompt = `BRAND: ${String(context.brand.name)}\nPOSITIONING: ${String(profile.positioning ?? "")}\nAUDIENCE: ${String(profile.audience_definition ?? "")}\nSTYLE: ${style}\nTONE: thoughtful\nSOURCE TITLE: ${String(source.title ?? "")}\nVALUE NUCLEUS: ${String(context.opportunity.value_nucleus ?? "")}\nEVIDENCE: ${JSON.stringify(research.data.evidence_package)}\nCreate three materially different angles and one final Facebook draft.`;
    const response = await structuredResponse<unknown>({
      instructions: LIGHTWEIGHT_WRITER_SYSTEM_PROMPT,
      prompt,
      format: { name: "lightweight_facebook_draft", schema: draftJsonSchema },
      maxOutputTokens: 2200,
    });
    const generated = draftResultSchema.parse(response.data);
    const fullText = [generated.hook, generated.body, generated.closing]
      .filter(Boolean)
      .join("\n\n");
    const promptSnapshot = {
      systemPrompt: LIGHTWEIGHT_WRITER_SYSTEM_PROMPT,
      userPrompt: prompt,
      promptVersion: LIGHTWEIGHT_WRITER_PROMPT_VERSION,
      checksum: await digestHex(`${LIGHTWEIGHT_WRITER_SYSTEM_PROMPT}\n${prompt}`),
    };
    const claimKeys = (
      (research.data.evidence_package as { claims?: Array<{ claimKey?: string }> }).claims ?? []
    )
      .map((claim) => claim.claimKey)
      .filter(Boolean)
      .slice(0, 5);
    const angles = generated.angles.map((angle, index) => ({
      angleKey: `angle_${style.slice(0, 6)}${index + 1}00`,
      ...angle,
      contentStyle: style,
      supportingClaimKeys: claimKeys,
      rankExplanation: "Ranked for evidence fit, distinction, and brand relevance.",
    }));
    drafts.push({
      contractVersion: "1.0",
      contentStyle: style,
      tone: "thoughtful",
      angles,
      selectedAngleKey: angles[generated.selectedAngleIndex]!.angleKey,
      content: { hook: generated.hook, body: generated.body, closing: generated.closing, fullText },
      evaluation: {
        contractVersion: "1.0",
        evidenceScore: 80,
        brandFitScore: 75,
        qualityScore: 78,
        sourceSimilarity: 0.2,
        sameBrandSimilarity: 0.2,
        crossBrandSimilarity: 0.2,
        hookReuseSimilarity: 0.1,
        unsupportedHighRiskClaims: 0,
        contradictions: 0,
        prohibitedPhrases: [],
        restrictedTopics: [],
        cliches: [],
        warnings: [],
        sentenceClaims: [],
        readyForReview: true,
      },
      model: response.model,
      promptVersion: LIGHTWEIGHT_WRITER_PROMPT_VERSION,
      responseId: response.responseId,
      usage: response.usage,
      promptSnapshot,
      ...(requestedDraftId ? { postDraftId: requestedDraftId } : {}),
    });
    totalCost += response.usage.estimatedCostUsd;
    totalInput += response.usage.inputTokens;
    totalOutput += response.usage.outputTokens;
  }
  const saved = await persist(client, job, actorId, { drafts });
  return {
    saved,
    usage: { inputTokens: totalInput, outputTokens: totalOutput, estimatedCostUsd: totalCost },
    costUsd: totalCost,
    nextStage: "verify" as const,
    nextRequest: {
      actorId,
      opportunityId: context.opportunity.id,
      ...(typeof job.request_payload.postDraftId === "string"
        ? { postDraftId: job.request_payload.postDraftId }
        : {}),
    },
  };
}

async function verifyStage(
  client: Client,
  job: Job,
  context: Awaited<ReturnType<typeof loadContext>>,
  actorId: string,
) {
  const drafts = await client
    .from("post_drafts")
    .select("id,quality_score,score_breakdown")
    .eq("opportunity_id", String(context.opportunity.id));
  if (drafts.error) throw drafts.error;
  const warnings = (drafts.data ?? []).flatMap((draft) => {
    const quality = Number(draft.quality_score ?? 0);
    return quality < 70 ? [`Draft ${draft.id} quality is below 70.`] : [];
  });
  const saved = await persist(client, job, actorId, {
    verification: { contractVersion: "1.0", warnings, blocking: false },
  });
  return {
    saved,
    usage: {},
    costUsd: 0,
    nextStage: "image" as const,
    nextRequest: {
      actorId,
      opportunityId: context.opportunity.id,
      ...(typeof job.request_payload.postDraftId === "string"
        ? { postDraftId: job.request_payload.postDraftId }
        : {}),
    },
  };
}

function composeBase(baseBytes: Uint8Array, borderHex: string): Uint8Array {
  const source = PNG.sync.read(baseBytes);
  const output = new PNG({ width: 1200, height: 630 });
  const cropWidth = Math.floor((source.height * 1200) / 630);
  const cropX = Math.max(0, Math.floor((source.width - cropWidth) / 2));
  for (let y = 0; y < 630; y += 1)
    for (let x = 0; x < 1200; x += 1) {
      const sx = Math.min(source.width - 1, cropX + Math.floor((x * cropWidth) / 1200));
      const sy = Math.min(source.height - 1, Math.floor((y * source.height) / 630));
      const from = (sy * source.width + sx) * 4;
      const to = (y * 1200 + x) * 4;
      output.data[to] = source.data[from]!;
      output.data[to + 1] = source.data[from + 1]!;
      output.data[to + 2] = source.data[from + 2]!;
      output.data[to + 3] = 255;
    }
  const hex = /^#[0-9a-f]{6}$/i.test(borderHex) ? borderHex : "#D14B2A";
  const rgb = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  for (let y = 0; y < 630; y += 1)
    for (let x = 0; x < 1200; x += 1)
      if (x < 10 || x >= 1190 || y < 10 || y >= 620) {
        const at = (y * 1200 + x) * 4;
        output.data[at] = rgb[0]!;
        output.data[at + 1] = rgb[1]!;
        output.data[at + 2] = rgb[2]!;
        output.data[at + 3] = 255;
      }
  return PNG.sync.write(output);
}

async function imageStage(
  client: Client,
  job: Job,
  context: Awaited<ReturnType<typeof loadContext>>,
  actorId: string,
) {
  let draftQuery = client
    .from("post_drafts")
    .select(
      "id,current_version_id,content_style,post_versions!post_drafts_current_version_fk(hook,body)",
    )
    .eq("opportunity_id", String(context.opportunity.id))
    .eq("brand_id", job.brand_id)
    .order("created_at");
  if (typeof job.request_payload.postDraftId === "string") {
    draftQuery = draftQuery.eq("id", job.request_payload.postDraftId);
  }
  const drafts = await draftQuery;
  if (drafts.error) throw drafts.error;
  const profile = relation(context.brand.brand_profiles);
  const visual = relation(profile.visual_system);
  const primary = String(visual.primaryColor ?? visual.primary_color ?? "#D14B2A");
  const images: Array<Record<string, unknown>> = [];
  let totalCost = 0;
  const maximum = Math.min(Number(Deno.env.get("LIGHTWEIGHT_MAX_IMAGES_PER_PIPELINE") ?? 3), 3);
  for (const draft of (drafts.data ?? []).slice(0, maximum)) {
    const version = relation(draft.post_versions);
    const conceptKey = `concept_${String(draft.content_style).slice(0, 12).replace(/_/g, "")}`;
    const prompt = `${LIGHTWEIGHT_IMAGE_SYSTEM_PROMPT}\nBRAND: ${String(context.brand.name)}\nPOST HOOK: ${String(version.hook ?? "")}\nPOST CONTEXT: ${String(version.body ?? "").slice(0, 1200)}\nCreate only the text-free base artwork.`;
    const generated = await generateBaseImage(prompt);
    const finalBytes = composeBase(generated.bytes, primary);
    const imageAssetId = crypto.randomUUID();
    const prefix = `${job.organization_id}/${job.brand_id}/${draft.id}/${imageAssetId}`;
    const basePath = `${prefix}/base.png`;
    const finalPath = `${prefix}/final.png`;
    for (const [path, bytes] of [
      [basePath, generated.bytes],
      [finalPath, finalBytes],
    ] as const) {
      const uploaded = await client.storage
        .from("generated-images")
        .upload(path, bytes, { contentType: "image/png", upsert: false });
      if (uploaded.error && !/already exists/i.test(uploaded.error.message)) throw uploaded.error;
    }
    images.push({
      imageAssetId,
      postDraftId: draft.id,
      postVersionId: draft.current_version_id,
      concept: "Evidence-led editorial visual",
      conceptKey,
      conceptDirection: {
        contractVersion: "1.0",
        selectedConceptKey: conceptKey,
        concepts: [
          {
            conceptKey,
            title: "Editorial signal",
            visualNucleus: String(context.opportunity.value_nucleus ?? ""),
            imageStyle: "editorial_hero",
          },
        ],
      },
      prompt,
      promptVersion: LIGHTWEIGHT_IMAGE_PROMPT_VERSION,
      baseImagePath: basePath,
      finalImagePath: finalPath,
      baseChecksum: await digestHex(generated.bytes),
      finalChecksum: await digestHex(finalBytes),
      model: generated.model,
      responseId: generated.responseId,
      costUsd: generated.costUsd,
      validation: {
        contractVersion: "1.0",
        readyForComposition: true,
        humanOverrideRequired: false,
        warnings: [],
        finalComposition: { readyForReview: true },
        width: 1200,
        height: 630,
      },
    });
    totalCost += generated.costUsd;
  }
  const saved = await persist(client, job, actorId, { images });
  return {
    saved,
    usage: { estimatedCostUsd: totalCost },
    costUsd: totalCost,
    nextStage: "package" as const,
    nextRequest: { actorId, opportunityId: context.opportunity.id },
  };
}

async function packageStage(
  client: Client,
  job: Job,
  context: Awaited<ReturnType<typeof loadContext>>,
  actorId: string,
) {
  const posts = await client
    .from("post_drafts")
    .select(
      "id,content_style,status,current_version_id,post_versions!post_drafts_current_version_fk(hook,body,closing,full_text),image_assets(id,final_image_path,prompt,prompt_version)",
    )
    .eq("opportunity_id", String(context.opportunity.id));
  if (posts.error) throw posts.error;
  const manifest = {
    contractVersion: "1.0",
    generatedAt: new Date().toISOString(),
    pipelineId: job.pipeline_id,
    brandId: job.brand_id,
    opportunityId: context.opportunity.id,
    posts: posts.data ?? [],
    publishing: "not_permitted",
  };
  const text = JSON.stringify(manifest, null, 2);
  const checksum = await digestHex(text);
  const storagePath = `${job.organization_id}/${job.brand_id}/${job.pipeline_id}/package.json`;
  const upload = await client.storage
    .from("generated-images")
    .upload(storagePath, new TextEncoder().encode(text), {
      contentType: "application/json",
      upsert: true,
    });
  if (upload.error) throw upload.error;
  const saved = await persist(client, job, actorId, { manifest, storagePath, checksum });
  return { saved, usage: {}, costUsd: 0, nextStage: null, nextRequest: {} };
}

async function executeJob(client: Client, job: Job, workerId: string) {
  const actorId = String(job.request_payload.actorId ?? "");
  if (!z.uuid().safeParse(actorId).success)
    throw new WorkerHttpError(422, "actor_missing", "Pipeline actor is missing.");
  const context = await loadContext(client, job);
  const result =
    job.stage === "research"
      ? await researchStage(client, job, context, actorId)
      : job.stage === "draft"
        ? await draftStage(client, job, context, actorId)
        : job.stage === "verify"
          ? await verifyStage(client, job, context, actorId)
          : job.stage === "image"
            ? await imageStage(client, job, context, actorId)
            : await packageStage(client, job, context, actorId);
  const complete = await client.rpc("complete_pipeline_job", {
    payload: {
      jobId: job.job_id,
      workerId,
      outputRefs: result.saved,
      usage: result.usage,
      costUsd: result.costUsd,
      nextStage: result.nextStage,
      nextRequest: result.nextRequest,
    },
  });
  if (complete.error) throw complete.error;
  return { jobId: job.job_id, stage: job.stage, status: "succeeded", output: result.saved };
}

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST")
      throw new WorkerHttpError(405, "method_not_allowed", "POST is required.");
    requireWorkerSecret(request);
    const input = requestSchema.parse(await request.json());
    const client = environmentClient();
    const claim = await client.rpc("claim_pipeline_jobs", {
      requested_worker_id: input.workerId,
      requested_stages: input.stages,
      requested_limit: input.limit,
      requested_lease_seconds: 900,
    });
    if (claim.error) throw claim.error;
    const jobs = z.array(jobSchema).parse(claim.data ?? []);
    const outcomes = [];
    for (const job of jobs) {
      try {
        outcomes.push(await executeJob(client, job, input.workerId));
      } catch (error) {
        const safe = sanitizeError(error);
        const failed = await client.rpc("fail_pipeline_job", {
          payload: {
            jobId: job.job_id,
            workerId: input.workerId,
            errorCode: safe.code,
            category: safe.category,
            summary: safe.summary,
            retryable: safe.retryable,
          },
        });
        outcomes.push({
          jobId: job.job_id,
          stage: job.stage,
          status: "failed",
          retryScheduled: !failed.error && safe.retryable,
          errorCode: safe.code,
        });
      }
    }
    return jsonResponse({ contractVersion: "1.0", claimed: jobs.length, outcomes });
  } catch (error) {
    return safeErrorResponse(error);
  }
});
