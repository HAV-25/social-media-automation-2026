import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  imageTemplateSchema,
  imageValidationSchema,
  type ImageTemplate,
  type ImageValidation,
} from "@content-engine/contracts";
import type { Font } from "opentype.js";
import sharp from "sharp";

let opentypeRuntime: typeof import("opentype.js") | undefined;
const bundledFontRelativePath = "packages/image-compositor/assets/Inter-Bold.ttf";
let bundledFont: Font | undefined;

function getOpenTypeRuntime() {
  opentypeRuntime ??= createRequire(import.meta.url)("opentype.js") as typeof import("opentype.js");
  return opentypeRuntime;
}

function loadBundledFont() {
  if (bundledFont) return bundledFont;
  const bundledFontPath = [
    path.join(process.cwd(), bundledFontRelativePath),
    path.join(process.cwd(), "../..", bundledFontRelativePath),
  ].find((candidate) => existsSync(candidate));
  if (!bundledFontPath) throw new Error("The bundled image-compositor font is unavailable.");
  const bundledFontBuffer = readFileSync(bundledFontPath);
  bundledFont = getOpenTypeRuntime().parse(
    bundledFontBuffer.buffer.slice(
      bundledFontBuffer.byteOffset,
      bundledFontBuffer.byteOffset + bundledFontBuffer.byteLength,
    ),
  );
  return bundledFont;
}

export const FACEBOOK_IMAGE_WIDTH = 1200;
export const FACEBOOK_IMAGE_HEIGHT = 630;
export const CANONICAL_IMAGE_WIDTH = 1536;
export const CANONICAL_IMAGE_HEIGHT = 1024;

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
  };
};

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
      return { maxCharactersPerLine: 18, maxLines: 4, fontSize: 60 };
    case "headline_panel":
      return { maxCharactersPerLine: 22, maxLines: 4, fontSize: 66 };
    case "concept_frame":
      return { maxCharactersPerLine: 28, maxLines: 3, fontSize: 54 };
    case "editorial_overlay":
      return { maxCharactersPerLine: 30, maxLines: 3, fontSize: 58 };
  }
}

function fontForTheme(theme: BrandImageTheme) {
  if (!theme.fontDataBase64) return loadBundledFont();
  if (!/^[A-Za-z0-9+/=]+$/.test(theme.fontDataBase64)) {
    throw new Error("Brand font data must be valid base64.");
  }
  const fontBuffer = Buffer.from(theme.fontDataBase64, "base64");
  return getOpenTypeRuntime().parse(
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

function overlaySvg(input: {
  width: number;
  height: number;
  template: ImageTemplate;
  headlineLines: string[];
  fontSize: number;
  theme: BrandImageTheme;
  textColor: string;
  sourceLabel: string;
}) {
  const { width, height, template, headlineLines, fontSize, theme, textColor } = input;
  const primary = assertHexColor(theme.primaryColor, "Primary color");
  const secondary = assertHexColor(theme.secondaryColor, "Secondary color");
  const accent = assertHexColor(theme.accentColor, "Accent color");
  const font = fontForTheme(theme);
  let shapes = "";
  let headline = "";
  if (template === "editorial_overlay") {
    shapes = `<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${primary}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${primary}" stop-opacity="0.96"/>
    </linearGradient></defs><rect x="0" y="${height * 0.34}" width="${width}" height="${height * 0.66}" fill="url(#fade)"/>
    <rect x="64" y="${height - 268}" width="92" height="8" rx="4" fill="${accent}"/>`;
    headline = headlineText(headlineLines, {
      x: 64,
      y: height - 196,
      lineHeight: fontSize * 1.12,
      fontSize,
      fill: textColor,
      font,
    });
  } else if (template === "insight_split") {
    shapes = `<rect x="0" y="0" width="${width * 0.49}" height="${height}" fill="${primary}"/>
      <rect x="${width * 0.49 - 10}" y="0" width="10" height="${height}" fill="${accent}"/>`;
    headline = headlineText(headlineLines, {
      x: 58,
      y: 174,
      lineHeight: fontSize * 1.08,
      fontSize,
      fill: textColor,
      font,
    });
  } else if (template === "concept_frame") {
    shapes = `<rect x="26" y="26" width="${width - 52}" height="${height - 52}" rx="20" fill="none" stroke="${accent}" stroke-width="8"/>
      <rect x="44" y="${height - 190}" width="${width - 88}" height="146" rx="14" fill="${primary}" fill-opacity="0.92"/>`;
    headline = headlineText(headlineLines, {
      x: 70,
      y: height - 130,
      lineHeight: fontSize * 1.05,
      fontSize,
      fill: textColor,
      font,
    });
  } else {
    shapes = `<rect x="0" y="0" width="${width}" height="${height}" fill="${primary}"/>
      <path d="M${width * 0.68} 0 H${width} V${height} H${width * 0.43} Z" fill="${secondary}"/>
      <circle cx="${width - 120}" cy="110" r="58" fill="${accent}"/>`;
    headline = headlineText(headlineLines, {
      x: 64,
      y: 188,
      lineHeight: fontSize * 1.08,
      fontSize,
      fill: textColor,
      font,
    });
  }
  const brand = vectorText(theme.brandName.toLocaleUpperCase("en"), {
    x: 64,
    y: 58,
    fontSize: 24,
    fill: textColor,
    font,
  });
  const source = vectorText(input.sourceLabel, {
    x: 64,
    y: height - 28,
    fontSize: 20,
    fill: textColor,
    font,
  });
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

export async function composeBrandedImage(input: CompositionInput): Promise<CompositionResult> {
  const template = imageTemplateSchema.parse(input.template);
  const width = input.width ?? FACEBOOK_IMAGE_WIDTH;
  const height = input.height ?? FACEBOOK_IMAGE_HEIGHT;
  if (width < 600 || width > 2400 || height < 315 || height > 2400) {
    throw new Error("Output dimensions are outside the supported composition range.");
  }
  const rules = templateRules(template);
  const headlineLines = wrapHeadline(input.headline, rules);
  const background =
    template === "headline_panel" || template === "insight_split"
      ? input.theme.primaryColor
      : "#111111";
  const textColor = chooseTextColor(background, input.theme.preferredTextColor);
  if (contrastRatio(textColor, background) < 4.5) {
    throw new Error("No accessible text color is available for this template.");
  }
  const overlay = overlaySvg({
    width,
    height,
    template,
    headlineLines,
    fontSize: rules.fontSize,
    theme: input.theme,
    textColor,
    sourceLabel: input.sourceLabel?.trim().slice(0, 120) ?? "",
  });
  const composites: sharp.OverlayOptions[] = [{ input: overlay, top: 0, left: 0 }];
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
  return {
    image,
    width,
    height,
    mimeType: "image/png",
    checksum: createHash("sha256").update(image).digest("hex"),
    layout: {
      template,
      headlineLines,
      fontSize: rules.fontSize,
      textColor,
      logoSafeArea: { x: width - 210, y: 18, width: 190, height: 92 },
    },
  };
}
