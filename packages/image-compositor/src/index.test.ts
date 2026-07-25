import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  composeBrandedImage,
  contrastRatio,
  createDeterministicBaseImage,
  validateBaseImage,
  wrapHeadline,
} from "./index";

const theme = {
  brandName: "Klaank",
  primaryColor: "#10243E",
  secondaryColor: "#2B5D7D",
  accentColor: "#F5B942",
};

describe("deterministic image compositor", () => {
  it("wraps and truncates headlines within explicit line limits", () => {
    const lines = wrapHeadline(
      "A deliberately long headline that must remain inside the branded image safe area",
      { maxCharactersPerLine: 18, maxLines: 3 },
    );
    expect(lines).toHaveLength(3);
    expect(lines.every((line) => line.length <= 18)).toBe(true);
    expect(lines.at(-1)).toMatch(/…$/);
  });

  it("chooses measurable contrast and validates fake base art", async () => {
    expect(contrastRatio("#FFFFFF", "#10243E")).toBeGreaterThan(4.5);
    const base = await createDeterministicBaseImage({ seed: "fixture", ...theme });
    const validation = await validateBaseImage(base);
    expect(validation.readyForComposition).toBe(true);
    expect(validation).toMatchObject({
      width: 1536,
      height: 1024,
      mimeType: "image/png",
      humanOverrideRequired: false,
    });
  });

  it.each(["editorial_overlay", "insight_split", "concept_frame", "headline_panel"] as const)(
    "renders a deterministic 1200x630 %s image",
    async (template) => {
      const base = await createDeterministicBaseImage({ seed: "golden-fixture", ...theme });
      const first = await composeBrandedImage({
        baseImage: base,
        template,
        headline: "Evidence first. Perspective that earns attention.",
        sourceLabel: "Internal editorial review",
        theme,
      });
      const second = await composeBrandedImage({
        baseImage: base,
        template,
        headline: "Evidence first. Perspective that earns attention.",
        sourceLabel: "Internal editorial review",
        theme,
      });
      const metadata = await sharp(first.image).metadata();
      expect(metadata).toMatchObject({ width: 1200, height: 630, format: "png" });
      expect(first.checksum).toBe(second.checksum);
      expect(first.checksum).toBe(createHash("sha256").update(first.image).digest("hex"));
    },
  );

  it("blocks unsafe provider observations until a human override", async () => {
    const base = await createDeterministicBaseImage({ seed: "unsafe-fixture", ...theme });
    const validation = await validateBaseImage(base, {
      generatedTextDetected: true,
      misleadingRepresentationRisk: "medium",
    });
    expect(validation.readyForComposition).toBe(false);
    expect(validation.humanOverrideRequired).toBe(true);
    expect(validation.warnings).toHaveLength(2);
  });
});
