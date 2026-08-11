import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  finalImageValidationSchema,
  imageTemplateSchema,
  imageValidationSchema,
  type FinalImageValidation,
  type ImageTemplate,
  type ImageValidation,
} from "@content-engine/contracts";
import type { Font } from "opentype.js";
import type sharpType from "sharp";
import type { OverlayOptions } from "sharp";

let opentypeRuntime: typeof import("opentype.js") | undefined;
let sharpRuntime: typeof sharpType | undefined;
const bundledFontRelativePath = "packages/image-compositor/assets/Inter-Bold.ttf";
let bundledFont: Font | undefined;

function getSharpRuntime() {
  if (sharpRuntime) return sharpRuntime;
  const moduleRuntime = process.getBuiltinModule("node:module");
  if (!moduleRuntime) throw new Error("The image-compositor module runtime is unavailable.");
  const loaded = moduleRuntime.createRequire(path.join(process.cwd(), "package.json"))("sharp") as
    | typeof sharpType
    | { default?: typeof sharpType };
  const candidate = typeof loaded === "function" ? loaded : loaded.default;
  if (typeof candidate !== "function") {
    throw new Error("The image-compositor Sharp runtime has an unsupported module shape.");
  }
  sharpRuntime = candidate;
  return sharpRuntime;
}

async function getOpenTypeRuntime() {
  if (opentypeRuntime) return opentypeRuntime;
  let opentypeModule: typeof import("opentype.js");
  try {
    opentypeModule = await import("opentype.js");
  } catch {
    throw new Error("The image-compositor OpenType runtime is unavailable.");
  }
  opentypeRuntime =
    (opentypeModule as unknown as { default?: typeof import("opentype.js") }).default ??
    opentypeModule;
  return opentypeRuntime;
}

export function findBundledFontPath(startDirectory = process.cwd()) {
  let directory = path.resolve(startDirectory);
  for (let depth = 0; depth <= 8; depth += 1) {
    const candidate = path.join(directory, bundledFontRelativePath);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

async function loadBundledFont() {
  if (bundledFont) return bundledFont;
  const bundledFontPath = findBundledFontPath();
  if (!bundledFontPath) throw new Error("The bundled image-compositor font is unavailable.");
  const bundledFontBuffer = readFileSync(bundledFontPath);
  try {
    bundledFont = (await getOpenTypeRuntime()).parse(
      bundledFontBuffer.buffer.slice(
        bundledFontBuffer.byteOffset,
        bundledFontBuffer.byteOffset + bundledFontBuffer.byteLength,
      ),
    );
  } catch (error) {
    if (error instanceof Error && /OpenType runtime/.test(error.message)) throw error;
    throw new Error("The bundled image-compositor font could not be parsed.");
  }
  return bundledFont;
}

export const FACEBOOK_IMAGE_WIDTH = 1200;
export const FACEBOOK_IMAGE_HEIGHT = 630;
export const CANONICAL_IMAGE_WIDTH = 1536;
export const CANONICAL_IMAGE_HEIGHT = 1024;

export async function preflightImageCompositor() {
  const sharp = getSharpRuntime();
  await loadBundledFont();
  await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
}

export type BrandImageTheme = {
  brandName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  preferredTextColor?: string;
  fontFamily?: string;
  fontDataBase64?: string;
  logo?: Buffer;
};

export type CompositionInput = {
  baseImage: Buffer;
  template: ImageTemplate;
  headline: string;
  sourceLabel?: string;
  theme: BrandImageTheme;
  width?: number;
  height?: number;
};

export type CompositionResult = {
  image: Buffer;
  width: number;
  height: number;
  mimeType: "image/png";
  checksum: string;
  layout: {
    template: ImageTemplate;
    headlineLines: string[];
    fontSize: number;
    textColor: string;
    logoSafeArea: { x: number; y: number; width: number; height: number };
    headlineBox: LayoutBox;
    headlineBounds: LayoutBox;
    brandBounds: LayoutBox;
    sourceBounds: LayoutBox | null;
    autoAdjusted: boolean;
  };
  validation: FinalImageValidation;
};

type LayoutBox = { x: number; y: number; width: number; height: number };

const hexColorPattern = /^#[0-9a-f]{6}$/i;

function assertHexColor(value: string, label: string) {
  if (!hexColorPattern.test(value)) throw new Error(`${label} must be a six-digit hex color.`);
  return value.toUpperCase();
}

function rgb(hex: string) {
  const value = assertHexColor(hex, "Color").slice(1);
  return {
    red: Number.parseInt(value.slice(0, 2), 16),
    green: Number.parseInt(value.slice(2, 4), 16),
    blue: Number.parseInt(value.slice(4, 6), 16),
  };
}

function luminance(hex: string) {
  const channels = Object.values(rgb(hex)).map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function contrastRatio(left: string, right: string) {
  const first = luminance(left);
  const second = luminance(right);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function chooseTextColor(background: string, preferred?: string) {
  const candidates = [preferred, "#FFFFFF", "#111111"].filter((candidate): candidate is string =>
    Boolean(candidate && hexColorPattern.test(candidate)),
  );
  return candidates.sort(
    (left, right) => contrastRatio(right, background) - contrastRatio(left, background),
  )[0]!;
}

export function wrapHeadline(
  headline: string,
  options: { maxCharactersPerLine: number; maxLines: number },
) {
  const normalized = headline.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("Headline is required.");
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= options.maxCharactersPerLine) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current =
      word.length <= options.maxCharactersPerLine
        ? word
        : `${word.slice(0, options.maxCharactersPerLine - 1)}…`;
    if (lines.length === options.maxLines) break;
  }
  if (current && lines.length < options.maxLines) lines.push(current);
  const consumed = lines.join(" ").replaceAll("…", "").length;
  if (consumed < normalized.length && lines.length > 0) {
    const lastIndex = lines.length - 1;
    const last = lines[lastIndex]!.replace(/[\s.…]+$/g, "");
    lines[lastIndex] = `${last.slice(0, Math.max(1, options.maxCharactersPerLine - 1))}…`;
  }
  return lines;
}

function templateRules(template: ImageTemplate) {
  switch (template) {
    case "insight_split":
      return { maxLines: 4, fontSize: 60, minFontSize: 36, lineHeightRatio: 1.08 };
    case "headline_panel":
      return { maxLines: 4, fontSize: 66, minFontSize: 38, lineHeightRatio: 1.08 };
    case "concept_frame":
      return { maxLines: 3, fontSize: 50, minFontSize: 30, lineHeightRatio: 1.05 };
    case "editorial_overlay":
      return { maxLines: 3, fontSize: 58, minFontSize: 36, lineHeightRatio: 1.12 };
  }
}

function templateHeadlineBox(template: ImageTemplate, width: number, height: number): LayoutBox {
  switch (template) {
    case "insight_split":
      return { x: 58, y: 126, width: width * 0.49 - 116, height: height - 216 };
    case "headline_panel":
      return { x: 64, y: 126, width: width * 0.57 - 96, height: height - 236 };
    case "concept_frame":
      return { x: 70, y: height - 202, width: width - 140, height: 116 };
    case "editorial_overlay":
      return { x: 64, y: height - 220, width: width - 128, height: 154 };
  }
}

function measureTextWidth(value: string, font: Font, fontSize: number) {
  return Array.from(value).reduce((width, character) => {
    const glyph = font.charToGlyph(character);
    return width + ((glyph.advanceWidth ?? font.unitsPerEm) / font.unitsPerEm) * fontSize;
  }, 0);
}

function textHeight(font: Font, fontSize: number) {
  return ((font.ascender - font.descender) / font.unitsPerEm) * fontSize;
}

function truncateToWidth(value: string, maxWidth: number, font: Font, fontSize: number) {
  if (measureTextWidth(value, font, fontSize) <= maxWidth) return value;
  const suffix = "…";
  let truncated = value.replace(/[\s.…]+$/g, "");
  while (truncated && measureTextWidth(`${truncated}${suffix}`, font, fontSize) > maxWidth) {
    truncated = truncated.slice(0, -1).replace(/\s+$/g, "");
  }
  return `${truncated || value.slice(0, 1)}${suffix}`;
}

function wrapHeadlineMeasured(
  headline: string,
  input: { maxWidth: number; maxLines: number; font: Font; fontSize: number },
) {
  const normalized = headline.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("Headline is required.");
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";
  let consumedWords = 0;
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureTextWidth(candidate, input.font, input.fontSize) <= input.maxWidth) {
      current = candidate;
      consumedWords += 1;
      continue;
    }
    if (current) lines.push(current);
    if (lines.length === input.maxLines) break;
    current = truncateToWidth(word, input.maxWidth, input.font, input.fontSize);
    consumedWords += 1;
  }
  if (current && lines.length < input.maxLines) lines.push(current);
  const truncated = consumedWords < words.length || lines.some((line) => line.endsWith("…"));
  if (truncated && lines.length > 0) {
    lines[lines.length - 1] = truncateToWidth(
      `${lines[lines.length - 1]!.replace(/[\s.…]+$/g, "")}…`,
      input.maxWidth,
      input.font,
      input.fontSize,
    );
  }
  return { lines, truncated };
}

function fitHeadline(input: {
  headline: string;
  box: LayoutBox;
  font: Font;
  preferredFontSize: number;
  minFontSize: number;
  maxLines: number;
  lineHeightRatio: number;
}) {
  for (let fontSize = input.preferredFontSize; fontSize >= input.minFontSize; fontSize -= 2) {
    const wrapped = wrapHeadlineMeasured(input.headline, {
      maxWidth: input.box.width,
      maxLines: input.maxLines,
      font: input.font,
      fontSize,
    });
    const lineHeight = fontSize * input.lineHeightRatio;
    const height = textHeight(input.font, fontSize) + lineHeight * (wrapped.lines.length - 1);
    if (height <= input.box.height) {
      const width = Math.max(
        ...wrapped.lines.map((line) => measureTextWidth(line, input.font, fontSize)),
      );
      return {
        ...wrapped,
        fontSize,
        lineHeight,
        bounds: { x: input.box.x, y: input.box.y, width, height },
        autoAdjusted: fontSize !== input.preferredFontSize || wrapped.truncated,
      };
    }
  }
  throw new Error("The headline cannot fit inside the selected image template.");
}

function fitSingleLine(
  value: string,
  box: LayoutBox,
  font: Font,
  preferredFontSize: number,
  minimumFontSize: number,
) {
  for (let fontSize = preferredFontSize; fontSize >= minimumFontSize; fontSize -= 2) {
    const width = measureTextWidth(value, font, fontSize);
    const height = textHeight(font, fontSize);
    if (width <= box.width && height <= box.height) {
      return {
        value,
        fontSize,
        bounds: { x: box.x, y: box.y, width, height },
        autoAdjusted: fontSize !== preferredFontSize,
      };
    }
  }
  const fontSize = minimumFontSize;
  const fittedValue = truncateToWidth(value, box.width, font, fontSize);
  return {
    value: fittedValue,
    fontSize,
    bounds: {
      x: box.x,
      y: box.y,
      width: measureTextWidth(fittedValue, font, fontSize),
      height: textHeight(font, fontSize),
    },
    autoAdjusted: true,
  };
}

async function fontForTheme(theme: BrandImageTheme) {
  if (!theme.fontDataBase64) return loadBundledFont();
  if (!/^[A-Za-z0-9+/=]+$/.test(theme.fontDataBase64)) {
    throw new Error("Brand font data must be valid base64.");
  }
  const fontBuffer = Buffer.from(theme.fontDataBase64, "base64");
  return (await getOpenTypeRuntime()).parse(
    fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength),
  );
}

function vectorText(
  value: string,
  input: { x: number; y: number; fontSize: number; fill: string; font: Font },
) {
  let cursor = input.x;
  const paths = Array.from(value).map((character) => {
    const glyph = input.font.charToGlyph(character);
    const pathData = glyph.getPath(cursor, input.y, input.fontSize).toPathData(2);
    cursor +=
      ((glyph.advanceWidth ?? input.font.unitsPerEm) / input.font.unitsPerEm) * input.fontSize;
    return pathData;
  });
  return `<path d="${paths.join(" ")}" fill="${input.fill}"/>`;
}

function headlineText(
  lines: string[],
  input: {
    x: number;
    y: number;
    lineHeight: number;
    fontSize: number;
    fill: string;
    font: Font;
  },
) {
  return lines
    .map((line, index) =>
      vectorText(line, {
        x: input.x,
        y: input.y + input.lineHeight * index,
        fontSize: input.fontSize,
        fill: input.fill,
        font: input.font,
      }),
    )
    .join("");
}

async function overlaySvg(input: {
  width: number;
  height: number;
  template: ImageTemplate;
  headlineLines: string[];
  fontSize: number;
  headlineBox: LayoutBox;
  lineHeight: number;
  theme: BrandImageTheme;
  textColor: string;
  font: Font;
  brand: { value: string; fontSize: number; box: LayoutBox };
  source: { value: string; fontSize: number; box: LayoutBox } | null;
}) {
  const { width, height, template, headlineLines, fontSize, theme, textColor, font } = input;
  const primary = assertHexColor(theme.primaryColor, "Primary color");
  const secondary = assertHexColor(theme.secondaryColor, "Secondary color");
  const accent = assertHexColor(theme.accentColor, "Accent color");
  let shapes = "";
  if (template === "editorial_overlay") {
    shapes = `<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${primary}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${primary}" stop-opacity="0.96"/>
    </linearGradient></defs><rect x="0" y="${height * 0.34}" width="${width}" height="${height * 0.66}" fill="url(#fade)"/>
    <rect x="64" y="${height - 268}" width="92" height="8" rx="4" fill="${accent}"/>`;
  } else if (template === "insight_split") {
    shapes = `<rect x="0" y="0" width="${width * 0.49}" height="${height}" fill="${primary}"/>
      <rect x="${width * 0.49 - 10}" y="0" width="10" height="${height}" fill="${accent}"/>`;
  } else if (template === "concept_frame") {
    shapes = `<rect x="26" y="26" width="${width - 52}" height="${height - 52}" rx="20" fill="none" stroke="${accent}" stroke-width="8"/>
      <rect x="44" y="${height - 220}" width="${width - 88}" height="176" rx="14" fill="${primary}" fill-opacity="0.92"/>`;
  } else {
    shapes = `<rect x="0" y="0" width="${width}" height="${height}" fill="${primary}"/>
      <path d="M${width * 0.68} 0 H${width} V${height} H${width * 0.43} Z" fill="${secondary}"/>
      <circle cx="${width - 120}" cy="110" r="58" fill="${accent}"/>`;
  }
  const headlineBaseline = input.headlineBox.y + (font.ascender / font.unitsPerEm) * input.fontSize;
  const headline = headlineText(headlineLines, {
    x: input.headlineBox.x,
    y: headlineBaseline,
    lineHeight: input.lineHeight,
    fontSize,
    fill: textColor,
    font,
  });
  const brand = vectorText(input.brand.value, {
    x: input.brand.box.x,
    y: input.brand.box.y + (font.ascender / font.unitsPerEm) * input.brand.fontSize,
    fontSize: input.brand.fontSize,
    fill: textColor,
    font,
  });
  const source = input.source
    ? vectorText(input.source.value, {
        x: input.source.box.x,
        y: input.source.box.y + (font.ascender / font.unitsPerEm) * input.source.fontSize,
        fontSize: input.source.fontSize,
        fill: textColor,
        font,
      })
    : "";
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${shapes}
    <g>${headline}</g>
    ${brand}
    ${source}
  </svg>`);
}

export async function createDeterministicBaseImage(input: {
  seed: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  width?: number;
  height?: number;
}) {
  const sharp = getSharpRuntime();
  const width = input.width ?? CANONICAL_IMAGE_WIDTH;
  const height = input.height ?? CANONICAL_IMAGE_HEIGHT;
  const digest = createHash("sha256").update(input.seed).digest();
  const x = 180 + (digest[0]! / 255) * (width - 360);
  const y = 160 + (digest[1]! / 255) * (height - 320);
  const radius = 140 + (digest[2]! / 255) * 220;
  const svg =
    Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${assertHexColor(input.primaryColor, "Primary color")}"/>
      <stop offset="100%" stop-color="${assertHexColor(input.secondaryColor, "Secondary color")}"/>
    </linearGradient><filter id="blur"><feGaussianBlur stdDeviation="42"/></filter></defs>
    <rect width="${width}" height="${height}" fill="url(#base)"/>
    <circle cx="${x}" cy="${y}" r="${radius}" fill="${assertHexColor(input.accentColor, "Accent color")}" opacity="0.72" filter="url(#blur)"/>
    <path d="M0 ${height * 0.78} C ${width * 0.3} ${height * 0.56}, ${width * 0.65} ${height * 1.02}, ${width} ${height * 0.66} V${height} H0Z" fill="#FFFFFF" opacity="0.12"/>
  </svg>`);
  return sharp(svg).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
}

export async function validateBaseImage(
  image: Buffer,
  observations: {
    generatedTextDetected?: boolean;
    unsafeImageryDetected?: boolean;
    misleadingRepresentationRisk?: "low" | "medium" | "high";
    focalSafeAreaClear?: boolean;
  } = {},
): Promise<ImageValidation> {
  const sharp = getSharpRuntime();
  const metadata = await sharp(image).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const mimeType =
    metadata.format === "jpeg"
      ? "image/jpeg"
      : metadata.format === "webp"
        ? "image/webp"
        : metadata.format === "png"
          ? "image/png"
          : null;
  if (!width || !height || !mimeType) throw new Error("Unsupported or unreadable base image.");
  const warnings: string[] = [];
  const generatedTextDetected = observations.generatedTextDetected ?? false;
  const unsafeImageryDetected = observations.unsafeImageryDetected ?? false;
  const misleadingRepresentationRisk = observations.misleadingRepresentationRisk ?? "low";
  const focalSafeAreaClear = observations.focalSafeAreaClear ?? true;
  if (generatedTextDetected) warnings.push("Generated text was detected in the base artwork.");
  if (unsafeImageryDetected) warnings.push("Potentially unsafe imagery requires human review.");
  if (misleadingRepresentationRisk !== "low") {
    warnings.push(
      misleadingRepresentationRisk === "high"
        ? "The visual could misleadingly represent a real event."
        : "The visual may be interpreted as representing a real event.",
    );
  }
  if (!focalSafeAreaClear) warnings.push("The focal subject overlaps the typography safe area.");
  if (image.byteLength > 20 * 1024 * 1024) warnings.push("Image exceeds the storage byte limit.");
  const aspectRatio = width / height;
  if (aspectRatio < 1 / 3 || aspectRatio > 3) warnings.push("Image aspect ratio is unsupported.");
  const humanOverrideRequired =
    generatedTextDetected ||
    unsafeImageryDetected ||
    misleadingRepresentationRisk !== "low" ||
    !focalSafeAreaClear;
  return imageValidationSchema.parse({
    contractVersion: "1.0",
    width,
    height,
    mimeType,
    byteLength: image.byteLength,
    aspectRatio,
    hasSufficientOverlayContrast: true,
    focalSafeAreaClear,
    generatedTextDetected,
    unsafeImageryDetected,
    misleadingRepresentationRisk,
    warnings,
    readyForComposition: warnings.length === 0,
    humanOverrideRequired,
  });
}

function containsBox(outer: LayoutBox, inner: LayoutBox) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export async function validateFinalImage(
  image: Buffer,
  input: {
    expectedWidth: number;
    expectedHeight: number;
    headlineBox: LayoutBox;
    headlineBounds: LayoutBox;
    brandBounds: LayoutBox;
    sourceBounds: LayoutBox | null;
    contrastRatio: number;
    autoAdjusted: boolean;
  },
): Promise<FinalImageValidation> {
  const sharp = getSharpRuntime();
  const metadata = await sharp(image).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const mimeType = metadata.format === "png" ? "image/png" : null;
  if (!width || !height || !mimeType) throw new Error("The final image is not a readable PNG.");
  const canvas = { x: 0, y: 0, width, height };
  const safeCanvas = { x: 26, y: 18, width: width - 52, height: height - 36 };
  const dimensionsMatch = width === input.expectedWidth && height === input.expectedHeight;
  const headlineFits =
    containsBox(input.headlineBox, input.headlineBounds) &&
    containsBox(canvas, input.headlineBounds);
  const brandLabelFits = containsBox(safeCanvas, input.brandBounds);
  const sourceLabelFits = input.sourceBounds ? containsBox(safeCanvas, input.sourceBounds) : true;
  const safeMarginsClear =
    containsBox(safeCanvas, input.headlineBounds) && brandLabelFits && sourceLabelFits;
  const hasSufficientContrast = input.contrastRatio >= 4.5;
  const warnings: string[] = [];
  if (!dimensionsMatch) warnings.push("The final image dimensions do not match 1200x630.");
  if (!headlineFits) warnings.push("The headline exceeds its template typography region.");
  if (!brandLabelFits) warnings.push("The brand label exceeds the image safe area.");
  if (!sourceLabelFits) warnings.push("The source label exceeds the image safe area.");
  if (!safeMarginsClear) warnings.push("Composed typography violates a canvas safe margin.");
  if (!hasSufficientContrast) warnings.push("Composed typography has insufficient contrast.");
  return finalImageValidationSchema.parse({
    width,
    height,
    mimeType,
    headlineFits,
    brandLabelFits,
    sourceLabelFits,
    safeMarginsClear,
    hasSufficientContrast,
    contrastRatio: input.contrastRatio,
    autoAdjusted: input.autoAdjusted,
    warnings,
    readyForReview:
      dimensionsMatch &&
      headlineFits &&
      brandLabelFits &&
      sourceLabelFits &&
      safeMarginsClear &&
      hasSufficientContrast,
  });
}

export async function composeBrandedImage(input: CompositionInput): Promise<CompositionResult> {
  const sharp = getSharpRuntime();
  const template = imageTemplateSchema.parse(input.template);
  const width = input.width ?? FACEBOOK_IMAGE_WIDTH;
  const height = input.height ?? FACEBOOK_IMAGE_HEIGHT;
  if (width < 600 || width > 2400 || height < 315 || height > 2400) {
    throw new Error("Output dimensions are outside the supported composition range.");
  }
  const rules = templateRules(template);
  const font = await fontForTheme(input.theme);
  const headlineBox = templateHeadlineBox(template, width, height);
  const fittedHeadline = fitHeadline({
    headline: input.headline,
    box: headlineBox,
    font,
    preferredFontSize: rules.fontSize,
    minFontSize: rules.minFontSize,
    maxLines: rules.maxLines,
    lineHeightRatio: rules.lineHeightRatio,
  });
  const background =
    template === "headline_panel" || template === "insight_split"
      ? input.theme.primaryColor
      : "#111111";
  const textColor = chooseTextColor(background, input.theme.preferredTextColor);
  const measuredContrast = contrastRatio(textColor, background);
  if (measuredContrast < 4.5) {
    throw new Error("No accessible text color is available for this template.");
  }
  const brandBox = { x: 64, y: 30, width: width - (input.theme.logo ? 274 : 128), height: 34 };
  const fittedBrand = fitSingleLine(
    input.theme.brandName.toLocaleUpperCase("en"),
    brandBox,
    font,
    24,
    14,
  );
  const sourceValue = input.sourceLabel?.trim().slice(0, 120) ?? "";
  const sourceBox = {
    x: template === "concept_frame" ? 70 : 64,
    y: template === "concept_frame" ? height - 72 : height - 48,
    width: template === "concept_frame" ? width - 140 : width - 128,
    height: 28,
  };
  const fittedSource = sourceValue ? fitSingleLine(sourceValue, sourceBox, font, 20, 12) : null;
  const overlay = await overlaySvg({
    width,
    height,
    template,
    headlineLines: fittedHeadline.lines,
    fontSize: fittedHeadline.fontSize,
    headlineBox,
    lineHeight: fittedHeadline.lineHeight,
    theme: input.theme,
    textColor,
    font,
    brand: { value: fittedBrand.value, fontSize: fittedBrand.fontSize, box: brandBox },
    source: fittedSource
      ? { value: fittedSource.value, fontSize: fittedSource.fontSize, box: sourceBox }
      : null,
  });
  const composites: OverlayOptions[] = [{ input: overlay, top: 0, left: 0 }];
  if (input.theme.logo) {
    const logo = await sharp(input.theme.logo)
      .resize({ width: 150, height: 64, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    composites.push({ input: logo, top: 30, left: width - 190 });
  }
  const image = await sharp(input.baseImage)
    .resize(width, height, { fit: "cover", position: "attention" })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .withMetadata({ density: 72 })
    .toBuffer();
  const autoAdjusted =
    fittedHeadline.autoAdjusted || fittedBrand.autoAdjusted || Boolean(fittedSource?.autoAdjusted);
  const validation = await validateFinalImage(image, {
    expectedWidth: width,
    expectedHeight: height,
    headlineBox,
    headlineBounds: fittedHeadline.bounds,
    brandBounds: fittedBrand.bounds,
    sourceBounds: fittedSource?.bounds ?? null,
    contrastRatio: measuredContrast,
    autoAdjusted,
  });
  return {
    image,
    width,
    height,
    mimeType: "image/png",
    checksum: createHash("sha256").update(image).digest("hex"),
    layout: {
      template,
      headlineLines: fittedHeadline.lines,
      fontSize: fittedHeadline.fontSize,
      textColor,
      logoSafeArea: { x: width - 210, y: 18, width: 190, height: 92 },
      headlineBox,
      headlineBounds: fittedHeadline.bounds,
      brandBounds: fittedBrand.bounds,
      sourceBounds: fittedSource?.bounds ?? null,
      autoAdjusted,
    },
    validation,
  };
}
