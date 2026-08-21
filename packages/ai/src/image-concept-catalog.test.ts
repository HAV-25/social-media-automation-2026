import { describe, expect, it } from "vitest";
import { CONCEPT_ARCHETYPES, selectDivergentConcepts } from "./image-concept-catalog";

describe("selectDivergentConcepts", () => {
  it("returns three archetypes that diverge in group and render style", () => {
    const trio = selectDivergentConcepts({ seed: "post-1" });
    expect(trio).toHaveLength(3);
    expect(trio.map((archetype) => archetype.group)).toEqual([
      "photographic",
      "conceptual",
      "structured",
    ]);
    expect(new Set(trio.map((archetype) => archetype.imageStyle)).size).toBe(3);
    expect(new Set(trio.map((archetype) => archetype.id)).size).toBe(3);
  });

  it("varies the trio across different topics", () => {
    const seeds = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const signatures = new Set(
      seeds.map((seed) =>
        selectDivergentConcepts({ seed })
          .map((archetype) => archetype.id)
          .join("|"),
      ),
    );
    expect(signatures.size).toBeGreaterThan(1);
  });

  it("is deterministic for a given seed", () => {
    expect(selectDivergentConcepts({ seed: "x" }).map((archetype) => archetype.id)).toEqual(
      selectDivergentConcepts({ seed: "x" }).map((archetype) => archetype.id),
    );
  });

  it("lets a brand's preferred style bias the lead archetype", () => {
    const trio = selectDivergentConcepts({
      seed: "post-2",
      preferredStyle: "branded_headline_card",
    });
    expect(trio[0]?.imageStyle).toBe("branded_headline_card");
  });

  it("gives every archetype a topic-specific brief", () => {
    for (const archetype of CONCEPT_ARCHETYPES) {
      expect(archetype.brief("robots recycling circuit boards")).toContain(
        "robots recycling circuit boards",
      );
    }
  });
});
