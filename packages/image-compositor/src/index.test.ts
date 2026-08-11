import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  composeBrandedImage,
  contrastRatio,
  createDeterministicBaseImage,
  findBundledFontPath,
  preflightImageCompositor,
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
  it("packages the complete native Sharp runtime for Netlify", () => {
    const netlifyConfig = readFileSync(
      path.resolve(process.cwd(), "../../apps/web/netlify.toml"),
      "utf8",
    );

    expect(netlifyConfig).toContain('"node_modules/sharp/**/*"');
    expect(netlifyConfig).toContain('"node_modules/@img/**/*"');
    expect(netlifyConfig).toContain('"packages/image-compositor/assets/Inter-Bold.ttf"');
    expect(netlifyConfig).toContain('external_node_modules = ["sharp"]');
    expect(
      JSON.parse(readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")).dependencies[
        "@img/sharp-wasm32"
      ],
    ).toBe("0.35.0");
  });

  it("finds its bundled font from nested serverless runtime directories", async () => {
    const nestedRuntimeDirectory = path.join(
      process.cwd(),
      "apps",
      "web",
      ".netlify",
      "functions-internal",
      "___netlify-server-handler",
    );
    expect(findBundledFontPath(nestedRuntimeDirectory)).toMatch(
      /packages[\\/]image-compositor[\\/]assets[\\/]Inter-Bold\.ttf$/,
    );
    await expect(preflightImageCompositor()).resolves.toBeUndefined();
  });

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
      expect(first.validation.readyForReview).toBe(true);
      expect(first.validation).toMatchObject({
        headlineFits: true,
        brandLabelFits: true,
        sourceLabelFits: true,
        safeMarginsClear: true,
        hasSufficientContrast: true,
      });
    },
  );

  it("auto-fits the long KUKA headline inside the Concept-frame panel", async () => {
    const base = await createDeterministicBaseImage({ seed: "kuka-layout-regression", ...theme });
    const result = await composeBrandedImage({
      baseImage: base,
      template: "concept_frame",
      headline: "KUKA deploys Automation Management Platform for North American automakers",
      sourceLabel: "KUKA Toledo Production Operations",
      theme,
    });

    expect(result.layout.headlineLines.length).toBeLessThanOrEqual(3);
    expect(result.layout.headlineBounds.x).toBeGreaterThanOrEqual(result.layout.headlineBox.x);
    expect(result.layout.headlineBounds.y).toBeGreaterThanOrEqual(result.layout.headlineBox.y);
    expect(result.layout.headlineBounds.x + result.layout.headlineBounds.width).toBeLessThanOrEqual(
      result.layout.headlineBox.x + result.layout.headlineBox.width,
    );
    expect(
      result.layout.headlineBounds.y + result.layout.headlineBounds.height,
    ).toBeLessThanOrEqual(result.layout.headlineBox.y + result.layout.headlineBox.height);
    expect(result.validation.readyForReview).toBe(true);
    expect(result.validation.headlineFits).toBe(true);
    expect(result.validation.safeMarginsClear).toBe(true);
  });

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
