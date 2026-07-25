import { NextResponse } from "next/server";
import {
  rssFetchRequestSchema,
  rssFetchResultSchema,
  serverEnvSchema,
} from "@content-engine/contracts";
import { sha256Hex } from "@content-engine/security";
import {
  fetchBoundedSourceText,
  parseRssFeed,
  SourceFetchError,
} from "@content-engine/source-processing";
import { ZodError } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { authenticateWorkflowRequest, WorkflowAuthError } from "@/lib/workflow-auth";

export const dynamic = "force-dynamic";

function itemContentHash(item: {
  canonicalUrl?: string;
  guid: string;
  summary?: string;
  title: string;
}) {
  return sha256Hex(
    JSON.stringify([item.guid, item.canonicalUrl ?? "", item.title, item.summary ?? ""]),
  );
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let feedId: string | undefined;

  try {
    await authenticateWorkflowRequest(request, rawBody);
    const payload = rssFetchRequestSchema.parse(JSON.parse(rawBody));
    feedId = payload.feedId;
    const supabase = createSupabaseServiceClient();
    const { data: feed, error } = await supabase
      .from("rss_feeds")
      .select("id,feed_url")
      .eq("id", payload.feedId)
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    if (!feed) {
      return NextResponse.json(
        { error: { code: "feed_not_found", message: "Active RSS feed was not found." } },
        { status: 404 },
      );
    }

    const fetched = await fetchBoundedSourceText(feed.feed_url);
    const itemLimit = serverEnvSchema.parse(process.env).RSS_ITEMS_PER_FEED_PER_RUN;
    const items = parseRssFeed(fetched.text)
      .slice(0, itemLimit)
      .map((item) => ({
        ...item,
        summary: item.summary?.slice(0, 4_000),
        contentHash: itemContentHash(item),
      }));
    const fetchedAt = new Date().toISOString();
    const { error: pollError } = await supabase.rpc("record_rss_poll", {
      payload: {
        feedId: payload.feedId,
        status: "succeeded",
        observedAt: fetchedAt,
      },
    });
    if (pollError) throw pollError;

    return NextResponse.json(
      rssFetchResultSchema.parse({
        contractVersion: "1.0",
        feedId: payload.feedId,
        fetchedAt,
        finalUrl: fetched.finalUrl,
        items,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof WorkflowAuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_request",
            message: "Request body does not match the RSS fetch contract.",
          },
        },
        { status: 400 },
      );
    }
    if (error instanceof SourceFetchError) {
      if (feedId) {
        const supabase = createSupabaseServiceClient();
        await supabase.rpc("record_rss_poll", {
          payload: {
            feedId,
            status: "failed",
            errorCode: error.code,
            observedAt: new Date().toISOString(),
          },
        });
      }
      return NextResponse.json(
        { error: { code: error.code, message: "The RSS source could not be fetched safely." } },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: { code: "rss_fetch_failed", message: "RSS fetch failed." } },
      { status: 500 },
    );
  }
}
