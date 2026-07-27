import { describe, expect, it } from "vitest";
import { isRssItemActive, rssItemActivityTimestamp } from "./rss-archive-policy";

const windowStart = "2026-07-25T12:00:00.000Z";

describe("RSS rolling archive policy", () => {
  it("keeps only newly observed or recently resurfaced articles active", () => {
    expect(isRssItemActive({ firstSeenAt: "2026-07-25T12:00:00.000Z", windowStart })).toBe(true);
    expect(isRssItemActive({ firstSeenAt: "2026-07-25T11:59:59.999Z", windowStart })).toBe(false);
    expect(
      isRssItemActive({
        firstSeenAt: "2026-07-20T00:00:00.000Z",
        resurfacedAt: "2026-07-26T08:00:00.000Z",
        resurfaceWindowStart: "2026-07-26T00:00:00.000Z",
        windowStart,
      }),
    ).toBe(true);
    expect(
      isRssItemActive({
        firstSeenAt: "2026-07-20T00:00:00.000Z",
        resurfacedAt: "2026-07-25T23:59:59.999Z",
        resurfaceWindowStart: "2026-07-26T00:00:00.000Z",
        windowStart,
      }),
    ).toBe(false);
  });

  it("sorts resurfaced articles by the explicit review action", () => {
    expect(
      rssItemActivityTimestamp({
        firstSeenAt: "2026-07-20T00:00:00.000Z",
        resurfacedAt: "2026-07-26T08:00:00.000Z",
      }),
    ).toBe(Date.parse("2026-07-26T08:00:00.000Z"));
  });
});
