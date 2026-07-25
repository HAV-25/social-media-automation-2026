import { describe, expect, it } from "vitest";
import { demoBrandRecords, getDemoBrandContext } from "../lib/demo-brand-memory";

describe("seed brand memories", () => {
  it("provides independent context for every initial brand", () => {
    expect(demoBrandRecords).toHaveLength(5);
    const contexts = demoBrandRecords.map((record) => getDemoBrandContext(record.brand.id));
    const positioning = contexts.map((context) => context?.identity.positioning);
    const voiceFingerprints = contexts.map((context) => JSON.stringify(context?.voice));

    expect(new Set(positioning).size).toBe(5);
    expect(new Set(voiceFingerprints).size).toBe(5);
  });

  it("keeps demo brand examples scoped to their own brand", () => {
    for (const record of demoBrandRecords) {
      expect(record.examples.every((example) => example.brandId === record.brand.id)).toBe(true);
      expect(getDemoBrandContext(record.brand.id)?.selectedExamples).toHaveLength(1);
    }
  });
});
