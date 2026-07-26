import { contentStyleSchema, toneSchema } from "@content-engine/contracts";
import { describe, expect, it } from "vitest";
import {
  editorialStyles,
  explainStyleTone,
  getEditorialStyle,
  getToneOverlay,
  toneOverlays,
} from "./editorial-style-catalog";

describe("structured editorial style catalog", () => {
  it("covers every approved style and tone exactly once", () => {
    expect(editorialStyles.map((style) => style.id)).toEqual(contentStyleSchema.options);
    expect(toneOverlays.map((tone) => tone.id)).toEqual(toneSchema.options);
    expect(new Set(editorialStyles.map((style) => style.id)).size).toBe(3);
    expect(new Set(toneOverlays.map((tone) => tone.id)).size).toBe(5);
  });

  it("fails safely to the approved Perspective and Thoughtful explanations", () => {
    expect(getEditorialStyle("untrusted").id).toBe("perspective_conversation");
    expect(getToneOverlay("untrusted").id).toBe("thoughtful");
  });

  it("explains every style-tone combination without exposing prompt controls", () => {
    for (const style of editorialStyles) {
      for (const tone of toneOverlays) {
        const explanation = explainStyleTone(style.id, tone.id);
        expect(explanation).toContain(style.shortLabel);
        expect(explanation).toContain(tone.label);
        expect(explanation).not.toMatch(/edit prompt|system prompt|raw prompt/i);
      }
    }
  });
});
