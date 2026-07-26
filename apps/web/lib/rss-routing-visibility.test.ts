import { describe, expect, it } from "vitest";
import { explainRssRouteFilter } from "./rss-routing-visibility";

describe("RSS routing visibility", () => {
  it("explains an item that does not match a brand include keyword", () => {
    expect(
      explainRssRouteFilter({
        title: "Memory chip maker prepares for its market debut",
        rawText: "The semiconductor company discussed investor demand.",
        includeKeywords: ["robot", "automation", "humanoid"],
        excludeKeywords: [],
      }),
    ).toBe("Filtered because it did not match this brand’s include keywords");
  });

  it("makes an excluded keyword decision explicit", () => {
    expect(
      explainRssRouteFilter({
        title: "Robotics influencer discusses a new gaming console",
        rawText: null,
        includeKeywords: ["robotics"],
        excludeKeywords: ["gaming console"],
      }),
    ).toBe("Filtered by excluded keyword “gaming console”");
  });
});
