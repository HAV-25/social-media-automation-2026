import { describe, expect, it } from "vitest";
import { deriveRssSelectionVisibility } from "./rss-selection-visibility";

const base = {
  selected: false,
  automaticPreparationAllowed: true,
  automaticSelection: true,
  generationPolicy: "score_then_research",
  score: 80,
  minimumScore: 75,
  selectedToday: 1,
  dailyLimit: 3,
};

describe("RSS selection visibility", () => {
  it("distinguishes selected, review, stored-only, capped, and awaiting opportunities", () => {
    expect(deriveRssSelectionVisibility({ ...base, selected: true })).toBe("selected");
    expect(deriveRssSelectionVisibility({ ...base, score: 75 })).toBe("awaiting_selection");
    expect(deriveRssSelectionVisibility({ ...base, score: 60 })).toBe("review");
    expect(deriveRssSelectionVisibility({ ...base, score: 74.99 })).toBe("review");
    expect(deriveRssSelectionVisibility({ ...base, score: 59.99 })).toBe("stored_only");
    expect(
      deriveRssSelectionVisibility({
        ...base,
        score: 80,
        automaticPreparationAllowed: false,
      }),
    ).toBe("review");
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
