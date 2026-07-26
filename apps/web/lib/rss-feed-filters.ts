import { z } from "zod";
import type { RssDailyItemDecision } from "./rss-daily-decisions";

export const rssFeedFilterSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  view: z.enum(["all", "priority", "review"]).catch("all"),
  feed: z.union([z.literal("all"), z.uuid()]).catch("all"),
  state: z.enum(["all", "scored", "filtered", "duplicate", "pending"]).catch("all"),
  minScore: z.coerce.number().min(0).max(100).optional().catch(undefined),
  sort: z.enum(["newest", "score_desc", "score_asc", "feed"]).catch("newest"),
});

export type RssFeedFilter = z.infer<typeof rssFeedFilterSchema>;

export function filterAndSortRssItems(
  items: RssDailyItemDecision[],
  filter: RssFeedFilter,
  automaticMinimumScore: number,
) {
  const query = filter.q.toLocaleLowerCase();
  return items
    .filter((item) => {
      if (filter.feed !== "all" && item.feedId !== filter.feed) return false;
      if (filter.state !== "all" && item.state !== filter.state) return false;
      if (filter.minScore !== undefined && (item.score ?? -1) < filter.minScore) return false;
      if (
        filter.view === "priority" &&
        (item.score === null ||
          item.score < automaticMinimumScore ||
          !["selected", "awaiting_selection", "daily_limit"].includes(item.selection))
      ) {
        return false;
      }
      if (filter.view === "review" && item.selection !== "review") return false;
      if (
        query &&
        !`${item.title} ${item.feedName} ${item.explanation}`.toLocaleLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      if (filter.sort === "score_desc") return (right.score ?? -1) - (left.score ?? -1);
      if (filter.sort === "score_asc") return (left.score ?? 101) - (right.score ?? 101);
      if (filter.sort === "feed") {
        return (
          left.feedName.localeCompare(right.feedName) ||
          Date.parse(right.firstSeenAt) - Date.parse(left.firstSeenAt)
        );
      }
      return (
        Date.parse(right.resurfacedAt ?? right.firstSeenAt) -
        Date.parse(left.resurfacedAt ?? left.firstSeenAt)
      );
    });
}
