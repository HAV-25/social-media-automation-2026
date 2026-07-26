import { describe, expect, it } from "vitest";
import { deriveRssSelectionVisibility } from "./rss-selection-visibility";

const base = {
  selected: false,
  automaticSelection: true,
  generationPolicy: "score_then_research",
  score: 80,
  minimumScore: 72,
  selectedToday: 1,
  dailyLimit: 3,
};

describe("RSS selection visibility", () => {
  it("distinguishes selected, below-threshold, capped, and awaiting opportunities", () => {
    expect(deriveRssSelectionVisibility({ ...base, selected: true })).toBe("selected");
    expect(deriveRssSelectionVisibility({ ...base, score: 71.99 })).toBe("below_threshold");
    expect(deriveRssSelectionVisibility({ ...base, selectedToday: 3 })).toBe("daily_limit");
    expect(deriveRssSelectionVisibility(base)).toBe("awaiting_selection");
  });

  it("shows scoring-only routes without implying post preparation", () => {
    expect(deriveRssSelectionVisibility({ ...base, generationPolicy: "ingest_only" })).toBe(
      "ingest_only",
    );
    expect(deriveRssSelectionVisibility({ ...base, automaticSelection: false })).toBe(
      "ingest_only",
    );
  });
});
