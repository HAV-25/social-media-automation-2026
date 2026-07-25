import { rssFeedMutationResultSchema, rssFeedUpsertRequestSchema } from "@content-engine/contracts";
import { sha256Hex } from "@content-engine/security";
import {
  canonicalizeSourceUrl,
  resolveSafeSourceUrl,
  SourceFetchError,
} from "@content-engine/source-processing";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { enforceUserApiRateLimit } from "@/lib/api-rate-limit";
import { getBrandConfiguration } from "@/lib/brand-configuration";
import {
  parseDemoRssFeeds,
  serializeDemoRssFeeds,
  type DemoRssFeed,
} from "@/lib/demo-rss-feed-store";
import { uuidFromDeterministicHash } from "@/lib/demo-content-store";
import { canManageBrand } from "@/lib/permissions";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const rpcRowSchema = z.object({
  rss_feed_id: z.uuid(),
  duplicate: z.boolean(),
  active: z.boolean(),
});

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return failure(403, "origin_rejected", "Cross-origin feed changes are not allowed.");
  }
  const user = await getCurrentUser();
  if (!user) return failure(401, "authentication_required", "Sign in to manage RSS feeds.");
  const rateLimited = await enforceUserApiRateLimit({ request, userId: user.id });
  if (rateLimited) return rateLimited;
  if (!canManageBrand(user.role)) {
    return failure(403, "editor_role_required", "Your role cannot manage RSS feeds.");
  }
  const parsed = rssFeedUpsertRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return failure(422, "invalid_feed", parsed.error.issues[0]?.message ?? "Feed is invalid.");
  }
  const routeBrandIds = [...new Set(parsed.data.brandRoutes.map((route) => route.brandId))];
  if (routeBrandIds.length !== parsed.data.brandRoutes.length) {
    return failure(422, "duplicate_brand_route", "Each brand can be routed only once.");
  }
  const configurations = await Promise.all(
    routeBrandIds.map((brandId) => getBrandConfiguration(brandId)),
  );
  if (configurations.some((configuration) => !configuration)) {
    return failure(404, "brand_not_found", "A routed brand is not assigned to this user.");
  }
  let canonicalUrl: string;
  try {
    canonicalUrl = canonicalizeSourceUrl(parsed.data.feedUrl);
    await resolveSafeSourceUrl(
      canonicalUrl,
      process.env.NEXT_PUBLIC_DEMO_MODE !== "false"
        ? async () => [{ address: "93.184.216.34", family: 4 }]
        : undefined,
    );
  } catch (error) {
    const message =
      error instanceof SourceFetchError ? error.message : "The feed URL is invalid or unsafe.";
    return failure(422, "unsafe_feed_url", message);
  }
  const normalizedPayload = { ...parsed.data, feedUrl: canonicalUrl };
  const requestHash = sha256Hex(JSON.stringify(normalizedPayload));

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const records = parseDemoRssFeeds(request.cookies.get("demo-rss-feeds")?.value);
    const existing = parsed.data.feedId
      ? records.find((feed) => feed.id === parsed.data.feedId)
      : records.find((feed) => feed.feedUrl === canonicalUrl);
    const feedId =
      existing?.id ??
      uuidFromDeterministicHash(sha256Hex(`${user.organizationId}:${canonicalUrl}`));
    const record: DemoRssFeed = {
      id: feedId,
      name: parsed.data.name,
      feedUrl: canonicalUrl,
      topicTags: parsed.data.topicTags,
      authorityScore: parsed.data.authorityScore,
      active: parsed.data.active,
      brandRoutes: parsed.data.brandRoutes,
      lastPolledAt: existing?.lastPolledAt ?? null,
      lastSuccessAt: existing?.lastSuccessAt ?? null,
      lastError: existing?.lastError ?? null,
      consecutiveFailures: existing?.consecutiveFailures ?? 0,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    const response = NextResponse.json(
      rssFeedMutationResultSchema.parse({
        contractVersion: "1.0",
        feedId,
        duplicate: Boolean(existing),
        active: record.active,
      }),
      { status: existing ? 200 : 201 },
    );
    response.cookies.set(
      "demo-rss-feeds",
      serializeDemoRssFeeds([record, ...records.filter((feed) => feed !== existing)]),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 8,
      },
    );
    return response;
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .rpc("upsert_rss_feed", {
      payload: {
        ...normalizedPayload,
        actorId: user.id,
        requestHash,
      },
    })
    .single();
  if (error) {
    return failure(
      error.code === "23505" ? 409 : 500,
      error.code === "23505" ? "feed_conflict" : "feed_persistence_failed",
      error.code === "23505"
        ? "This feed URL or idempotency key is already in use."
        : "The feed configuration could not be persisted.",
    );
  }
  const row = rpcRowSchema.parse(data);
  return NextResponse.json(
    rssFeedMutationResultSchema.parse({
      contractVersion: "1.0",
      feedId: row.rss_feed_id,
      duplicate: row.duplicate,
      active: row.active,
    }),
    { status: row.duplicate ? 200 : 201 },
  );
}
