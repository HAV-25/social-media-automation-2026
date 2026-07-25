import { describe, expect, it } from "vitest";
import { demoBrands, demoOpportunities } from "../lib/demo-data";

describe("demo dashboard data", () => {
  it("contains the five approved initial brands", () => {
    expect(demoBrands.map((brand) => brand.name)).toEqual([
      "Klaank",
      "Spaarker",
      "Nations of Tomorrow",
      "Business of AI",
      "Wyngs",
    ]);
  });

  it("keeps opportunity scores within the deterministic 0–100 range", () => {
    expect(demoOpportunities.every((item) => item.score >= 0 && item.score <= 100)).toBe(true);
  });
});
