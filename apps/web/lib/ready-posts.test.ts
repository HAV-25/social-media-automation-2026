import { describe, expect, it } from "vitest";
import { parseReadyPostFilters } from "./ready-post-filters";

describe("ready post filters", () => {
  it("accepts bounded review filters and sort order", () => {
    expect(
      parseReadyPostFilters({
        window: "7d",
        status: "changes_requested",
        style: "educational_breakdown",
        tone: "thoughtful",
        sort: "quality_desc",
      }),
    ).toEqual({
      window: "7d",
      status: "changes_requested",
      style: "educational_breakdown",
      tone: "thoughtful",
      sort: "quality_desc",
    });
  });

  it("falls back safely when URL parameters are hostile or malformed", () => {
    expect(
      parseReadyPostFilters({
        window: "../../../../etc",
        status: "approved",
        style: "<script>",
        tone: ["bold", "witty"],
        sort: "DROP TABLE",
      }),
    ).toEqual({
      window: "all",
      status: "all",
      style: "all",
      tone: "bold",
      sort: "updated_desc",
    });
  });
});
