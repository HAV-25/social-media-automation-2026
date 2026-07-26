import { describe, expect, it } from "vitest";
import type { RssDailyItemDecision } from "./rss-daily-decisions";
import { filterAndSortRssItems, rssFeedFilterSchema } from "./rss-feed-filters";

const item = (
  id: string,
  score: number | null,
  selection: RssDailyItemDecision["selection"],
  state: RssDailyItemDecision["state"] = "scored",
): RssDailyItemDecision => ({
  itemId: id,
  feedId:
    id === "priority"
      ? "00000000-0000-4000-8000-000000000001"
      : "00000000-0000-4000-8000-000000000002",
  feedName: id === "priority" ? "Robotics Daily" : "Technology Daily",
  title: `${id} article`,
  firstSeenAt: id === "priority" ? "2026-07-26T10:00:00.000Z" : "2026-07-26T11:00:00.000Z",
  inCurrentWindow: true,
  state,
  explanation: `${state} decision`,
  score,
  opportunityId: score === null ? null : "00000000-0000-4000-8000-000000000010",
  opportunityStatus: score === null ? null : "candidate",
  analysisBasis: score === null ? null : "full_article",
  resurfacedAt: null,
  selection,
});

const items = [
  item("priority", 82, "selected"),
  item("review", 68, "review"),
  item("filtered", null, "not_applicable", "filtered"),
];

describe("RSS feed filters", () => {
  it("separates automatic-priority and manual-review bands", () => {
    expect(
      filterAndSortRssItems(items, rssFeedFilterSchema.parse({ view: "priority" }), 75).map(
        (value) => value.itemId,
      ),
    ).toEqual(["priority"]);
    expect(
      filterAndSortRssItems(items, rssFeedFilterSchema.parse({ view: "review" }), 75).map(
        (value) => value.itemId,
      ),
    ).toEqual(["review"]);
  });

  it("combines feed decision, score, search, and score sorting safely", () => {
    const filtered = filterAndSortRssItems(
      items,
      rssFeedFilterSchema.parse({
        q: "daily",
        state: "scored",
        minScore: "60",
        sort: "score_asc",
      }),
      75,
    );
    expect(filtered.map((value) => value.itemId)).toEqual(["review", "priority"]);
  });
});
