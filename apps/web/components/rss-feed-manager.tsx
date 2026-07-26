"use client";

import { rssFeedMutationResultSchema, rssFeedUpsertRequestSchema } from "@content-engine/contracts";
import {
  Activity,
  CheckCircle2,
  LoaderCircle,
  Pause,
  Pencil,
  Radio,
  RotateCcw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { z } from "zod";
import type { RssFeedView } from "@/lib/rss-feeds";
import type { WorkspaceBrand } from "@/lib/workspace";

type UpsertRequest = z.infer<typeof rssFeedUpsertRequestSchema>;
type RouteDraft = Omit<
  UpsertRequest["brandRoutes"][number],
  "topicTags" | "includeKeywords" | "excludeKeywords"
> & {
  selected: boolean;
  topicTagsText: string;
  includeKeywordsText: string;
  excludeKeywordsText: string;
};

function splitList(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function routeDrafts(brands: WorkspaceBrand[], feed?: RssFeedView): RouteDraft[] {
  return brands.map((brand, index) => {
    const route = feed?.brandRoutes.find((item) => item.brandId === brand.id);
    return {
      brandId: brand.id,
      selected: Boolean(route) || (!feed && index === 0),
      generationPolicy: route?.generationPolicy ?? "score_then_research",
      minimumScore: route?.minimumScore ?? 75,
      dailyGenerationLimit: route?.dailyGenerationLimit ?? 3,
      topicTagsText: route?.topicTags.join(", ") ?? "",
      includeKeywordsText: route?.includeKeywords.join(", ") ?? "",
      excludeKeywordsText: route?.excludeKeywords.join(", ") ?? "",
    };
  });
}

export function RssFeedManager({
  brands,
  feeds,
}: {
  brands: WorkspaceBrand[];
  feeds: RssFeedView[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<RssFeedView | undefined>();
  const [routes, setRoutes] = useState<RouteDraft[]>(() => routeDrafts(brands));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const selectedCount = useMemo(() => routes.filter((route) => route.selected).length, [routes]);

  function startEditing(feed?: RssFeedView) {
    setEditing(feed);
    setRoutes(routeDrafts(brands, feed));
    setError("");
    setSaved("");
    document.getElementById("rss-feed-editor")?.scrollIntoView({ behavior: "smooth" });
  }

  function updateRoute(brandId: string, patch: Partial<RouteDraft>) {
    setRoutes((current) =>
      current.map((route) => (route.brandId === brandId ? { ...route, ...patch } : route)),
    );
  }

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    setSaved("");
    const payload: UpsertRequest = {
      contractVersion: "1.0",
      idempotencyKey: `rss-feed:${crypto.randomUUID()}`,
      feedId: editing?.id,
      name: String(formData.get("name")),
      feedUrl: String(formData.get("feedUrl")),
      topicTags: splitList(String(formData.get("topicTags"))),
      authorityScore: Number(formData.get("authorityScore")),
      active: formData.get("active") === "on",
      brandRoutes: routes
        .filter((route) => route.selected)
        .map(
          ({
            selected: _selected,
            topicTagsText,
            includeKeywordsText,
            excludeKeywordsText,
            ...route
          }) => ({
            ...route,
            topicTags: splitList(topicTagsText),
            includeKeywords: splitList(includeKeywordsText),
            excludeKeywords: splitList(excludeKeywordsText),
          }),
        ),
    };
    try {
      const response = await fetch("/api/rss-feeds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof body === "object" &&
          body &&
          "error" in body &&
          typeof body.error === "object" &&
          body.error &&
          "message" in body.error
            ? String(body.error.message)
            : "The feed could not be saved.";
        throw new Error(message);
      }
      const result = rssFeedMutationResultSchema.parse(body);
      setSaved(result.active ? "Feed configuration saved." : "Feed paused.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The feed could not be saved.");
    } finally {
      setPending(false);
    }
  }

  async function toggleActive(feed: RssFeedView) {
    setEditing(feed);
    setRoutes(routeDrafts(brands, feed));
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/rss-feeds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractVersion: "1.0",
          idempotencyKey: `rss-feed-status:${crypto.randomUUID()}`,
          feedId: feed.id,
          name: feed.name,
          feedUrl: feed.feedUrl,
          topicTags: feed.topicTags,
          authorityScore: feed.authorityScore,
          active: !feed.active,
          brandRoutes: feed.brandRoutes,
        } satisfies UpsertRequest),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error("Feed status could not be changed.");
      rssFeedMutationResultSchema.parse(body);
      setSaved(feed.active ? "Feed paused." : "Feed resumed.");
      router.refresh();
    } catch (toggleError) {
      setError(
        toggleError instanceof Error ? toggleError.message : "Feed status could not change.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_430px]">
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
              Source operations
            </p>
            <h1 className="serif mt-2 text-4xl tracking-[-0.04em]">RSS feed control room</h1>
          </div>
          <button
            type="button"
            onClick={() => startEditing()}
            className="rounded-xl bg-[var(--sage)] px-4 py-2.5 text-sm font-bold text-white"
          >
            Add feed
          </button>
        </div>
        {feeds.length ? (
          feeds.map((feed) => (
            <article
              key={feed.id}
              className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-full ${
                        feed.active
                          ? feed.lastError
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                          : "bg-stone-300"
                      }`}
                    />
                    <span className="text-[10px] font-bold tracking-[0.15em] text-[var(--muted)] uppercase">
                      {feed.active ? (feed.lastError ? "Attention" : "Active") : "Paused"}
                    </span>
                  </div>
                  <h2 className="serif mt-2 text-2xl">{feed.name}</h2>
                  <p className="mt-1 truncate text-xs text-[var(--muted)]">{feed.feedUrl}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEditing(feed)}
                    className="grid size-9 place-items-center rounded-xl border border-[var(--line)]"
                    aria-label={`Edit ${feed.name}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void toggleActive(feed)}
                    className="grid size-9 place-items-center rounded-xl border border-[var(--line)]"
                    aria-label={`${feed.active ? "Pause" : "Resume"} ${feed.name}`}
                  >
                    {feed.active ? <Pause size={15} /> : <RotateCcw size={15} />}
                  </button>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-stone-50 p-3">
                  <span className="text-[9px] font-bold text-[var(--muted)] uppercase">
                    Authority
                  </span>
                  <strong className="mt-1 block">{feed.authorityScore.toFixed(0)}/100</strong>
                </div>
                <div className="rounded-xl bg-stone-50 p-3">
                  <span className="text-[9px] font-bold text-[var(--muted)] uppercase">Brands</span>
                  <strong className="mt-1 block">{feed.brandRoutes.length}</strong>
                </div>
                <div className="rounded-xl bg-stone-50 p-3">
                  <span className="text-[9px] font-bold text-[var(--muted)] uppercase">
                    Last poll
                  </span>
                  <strong className="mt-1 block text-xs">
                    {feed.lastPolledAt?.slice(0, 16).replace("T", " ") ?? "Not yet"}
                  </strong>
                </div>
                <div className="rounded-xl bg-stone-50 p-3">
                  <span className="text-[9px] font-bold text-[var(--muted)] uppercase">
                    Failures
                  </span>
                  <strong className="mt-1 block">{feed.consecutiveFailures}</strong>
                </div>
              </div>
              {feed.lastError ? (
                <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  Latest error: {feed.lastError}
                </p>
              ) : null}
            </article>
          ))
        ) : (
          <div className="rounded-3xl border border-dashed border-[var(--line)] p-10 text-center">
            <Radio className="mx-auto text-[var(--sage)]" />
            <h2 className="serif mt-3 text-2xl">No feeds configured</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Add a public RSS or Atom URL and route it to one or more brands.
            </p>
          </div>
        )}
      </section>

      <form
        id="rss-feed-editor"
        action={submit}
        className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6 xl:sticky xl:top-6"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold tracking-[0.16em] text-[var(--sage)] uppercase">
              {editing ? "Edit feed" : "New feed"}
            </p>
            <h2 className="serif mt-1 text-2xl">Routing and policy</h2>
          </div>
          <Activity className="text-[var(--sage)]" />
        </div>
        <div className="mt-5 grid gap-4">
          <label className="text-xs font-bold text-[var(--muted)]">
            Feed name
            <input
              key={`name-${editing?.id ?? "new"}`}
              required
              name="name"
              defaultValue={editing?.name}
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm font-normal text-[var(--ink)]"
            />
          </label>
          <label className="text-xs font-bold text-[var(--muted)]">
            RSS or Atom URL
            <input
              key={`url-${editing?.id ?? "new"}`}
              required
              type="url"
              name="feedUrl"
              defaultValue={editing?.feedUrl}
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm font-normal text-[var(--ink)]"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-[var(--muted)]">
              Authority score
              <input
                key={`authority-${editing?.id ?? "new"}`}
                required
                type="number"
                name="authorityScore"
                min={0}
                max={100}
                defaultValue={editing?.authorityScore ?? 60}
                className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm font-normal text-[var(--ink)]"
              />
            </label>
            <label className="flex items-end gap-2 pb-2.5 text-xs font-bold text-[var(--muted)]">
              <input
                key={`active-${editing?.id ?? "new"}`}
                type="checkbox"
                name="active"
                defaultChecked={editing?.active ?? true}
              />
              Active polling
            </label>
          </div>
          <label className="text-xs font-bold text-[var(--muted)]">
            Feed topic tags
            <input
              key={`tags-${editing?.id ?? "new"}`}
              name="topicTags"
              defaultValue={editing?.topicTags.join(", ")}
              placeholder="AI governance, operating models"
              className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm font-normal text-[var(--ink)]"
            />
          </label>
        </div>

        <div className="mt-6 border-t border-[var(--line)] pt-5">
          <div className="flex items-center justify-between">
            <strong className="text-sm">Brand routes</strong>
            <span className="text-[10px] font-bold text-[var(--muted)]">
              {selectedCount} selected
            </span>
          </div>
          <div className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {routes.map((route) => {
              const brand = brands.find((item) => item.id === route.brandId);
              return (
                <div key={route.brandId} className="rounded-2xl border border-[var(--line)] p-4">
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={route.selected}
                      onChange={(event) =>
                        updateRoute(route.brandId, { selected: event.target.checked })
                      }
                    />
                    {brand?.name ?? "Assigned brand"}
                  </label>
                  {route.selected ? (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <label className="text-[10px] font-bold text-[var(--muted)]">
                        Route behavior
                        <select
                          value={route.generationPolicy}
                          onChange={(event) =>
                            updateRoute(route.brandId, {
                              generationPolicy: event.target
                                .value as RouteDraft["generationPolicy"],
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-2 text-xs font-normal text-[var(--ink)]"
                        >
                          <option value="score_then_research">Use in brand selection</option>
                          <option value="ingest_only">Store and score only</option>
                        </select>
                      </label>
                      <label className="text-[10px] font-bold text-[var(--muted)]">
                        Route tags
                        <input
                          value={route.topicTagsText}
                          onChange={(event) =>
                            updateRoute(route.brandId, {
                              topicTagsText: event.target.value,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-2 text-xs font-normal text-[var(--ink)]"
                        />
                      </label>
                      <p className="col-span-2 rounded-xl bg-stone-50 px-3 py-2 text-[10px] leading-4 text-[var(--muted)]">
                        Minimum score and daily volume are controlled once in this brand&apos;s
                        Daily opportunity selection settings.
                      </p>
                      <label className="text-[10px] font-bold text-[var(--muted)]">
                        Include keywords
                        <input
                          value={route.includeKeywordsText}
                          onChange={(event) =>
                            updateRoute(route.brandId, {
                              includeKeywordsText: event.target.value,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-2 text-xs font-normal text-[var(--ink)]"
                        />
                      </label>
                      <label className="text-[10px] font-bold text-[var(--muted)]">
                        Exclude keywords
                        <input
                          value={route.excludeKeywordsText}
                          onChange={(event) =>
                            updateRoute(route.brandId, {
                              excludeKeywordsText: event.target.value,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-2 text-xs font-normal text-[var(--ink)]"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        {error ? <p className="mt-4 text-xs text-red-700">{error}</p> : null}
        {saved ? (
          <p className="mt-4 flex items-center gap-2 text-xs text-emerald-700">
            <CheckCircle2 size={14} /> {saved}
          </p>
        ) : null}
        <button
          disabled={pending || selectedCount === 0}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {pending ? <LoaderCircle size={16} className="animate-spin" /> : null}
          {pending ? "Saving policy…" : "Save feed policy"}
        </button>
      </form>
    </div>
  );
}
