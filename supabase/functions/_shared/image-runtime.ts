import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
import { PNG } from "npm:pngjs@7.0.0";
import { Buffer } from "node:buffer";

export const FACEBOOK_WIDTH = 1200;
export const FACEBOOK_HEIGHT = 630;

type FinalValidation = {
  width: number;
  height: number;
  mimeType: "image/png";
  headlineFits: boolean;
  brandLabelFits: boolean;
  sourceLabelFits: boolean;
  safeMarginsClear: boolean;
  hasSufficientContrast: boolean;
  contrastRatio: number;
  autoAdjusted: boolean;
  warnings: string[];
  readyForReview: boolean;
};

type ComposedImage = {
  bytes: Uint8Array;
  validation: FinalValidation;
  layout: {
    headlineLines: string[];
    fontSize: number;
    sourceLabel: string;
    brandLabel: string;
    safeArea: { x: number; y: number; width: number; height: number };
  };
};

let wasmReady: Promise<void> | undefined;
let fontBytes: Promise<Uint8Array> | undefined;

function initializeResvg() {
  wasmReady ??= Deno.readFile(new URL("./assets/resvg-2.6.2.wasm", import.meta.url))
    .then((bytes) => initWasm(bytes))
    .catch((error) => {
      if (error instanceof Error && /already initialized/i.test(error.message)) return;
      throw error;
    });
  return wasmReady;
}

function loadFont() {
  fontBytes ??= Deno.readFile(new URL("./assets/Inter-Bold.ttf", import.meta.url));
  return fontBytes;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizedHex(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
}

function rgb(value: string) {
  const hex = value.slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function luminance(value: string) {
  const channels = rgb(value).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(left: string, right: string) {
  const first = luminance(left);
  const second = luminance(right);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function cropToFacebook(sourceBytes: Uint8Array) {
  const source = PNG.sync.read(Buffer.from(sourceBytes));
  if (!source.width || !source.height) throw new Error("Generated base image is unreadable.");
  const output = new PNG({ width: FACEBOOK_WIDTH, height: FACEBOOK_HEIGHT });
  const sourceRatio = source.width / source.height;
  const targetRatio = FACEBOOK_WIDTH / FACEBOOK_HEIGHT;
  const cropWidth =
    sourceRatio > targetRatio ? Math.floor(source.height * targetRatio) : source.width;
  const cropHeight =
    sourceRatio > targetRatio ? source.height : Math.floor(source.width / targetRatio);
  const cropX = Math.max(0, Math.floor((source.width - cropWidth) / 2));
  const cropY = Math.max(0, Math.floor((source.height - cropHeight) / 2));
  for (let y = 0; y < FACEBOOK_HEIGHT; y += 1) {
    for (let x = 0; x < FACEBOOK_WIDTH; x += 1) {
      const sx = Math.min(source.width - 1, cropX + Math.floor((x * cropWidth) / FACEBOOK_WIDTH));
      const sy = Math.min(
        source.height - 1,
        cropY + Math.floor((y * cropHeight) / FACEBOOK_HEIGHT),
      );
      const from = (sy * source.width + sx) * 4;
      const to = (y * FACEBOOK_WIDTH + x) * 4;
      output.data[to] = source.data[from]!;
      output.data[to + 1] = source.data[from + 1]!;
      output.data[to + 2] = source.data[from + 2]!;
      output.data[to + 3] = 255;
    }
  }
  return output;
}

function measuredWidth(text: string, fontSize: number, font: Uint8Array) {
  if (!text) return 0;
  const safe = escapeXml(text);
  const height = Math.ceil(fontSize * 1.6);
  const rendered = new Resvg(
    `<svg width="1200" height="${height}" xmlns="http://www.w3.org/2000/svg"><text x="0" y="${Math.ceil(fontSize * 1.2)}" font-family="Inter" font-size="${fontSize}" font-weight="700" fill="#FFFFFF">${safe}</text></svg>`,
    { font: { fontBuffers: [font], defaultFontFamily: "Inter", loadSystemFonts: false } },
  )
    .render()
    .asPng();
  const image = PNG.sync.read(Buffer.from(rendered));
  let right = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3]! > 0) right = Math.max(right, x);
    }
  }
  return right + 1;
}

function wrapHeadline(headline: string, font: Uint8Array) {
  const clean = headline.replace(/\s+/g, " ").trim();
  const configurations = [
    { fontSize: 58, maxWidth: 530, maxLines: 4 },
    { fontSize: 52, maxWidth: 530, maxLines: 4 },
    { fontSize: 46, maxWidth: 530, maxLines: 5 },
    { fontSize: 40, maxWidth: 530, maxLines: 6 },
  ];
  for (const configuration of configurations) {
    const words = clean.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measuredWidth(candidate, configuration.fontSize, font) <= configuration.maxWidth)
        line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    if (
      lines.length <= configuration.maxLines &&
      lines.every(
        (value) => measuredWidth(value, configuration.fontSize, font) <= configuration.maxWidth,
      )
    )
      return { lines, ...configuration, autoAdjusted: configuration.fontSize < 58, complete: true };
  }
  return {
    lines: [clean],
    fontSize: 40,
    maxWidth: 530,
    maxLines: 6,
    autoAdjusted: true,
    complete: false,
  };
}

function composite(background: PNG, overlayBytes: Uint8Array) {
  const overlay = PNG.sync.read(Buffer.from(overlayBytes));
  if (overlay.width !== background.width || overlay.height !== background.height) {
    throw new Error("Generated overlay dimensions are invalid.");
  }
  for (let index = 0; index < background.data.length; index += 4) {
    const alpha = overlay.data[index + 3]! / 255;
    if (alpha <= 0) continue;
    const inverse = 1 - alpha;
    background.data[index] = Math.round(
      overlay.data[index]! * alpha + background.data[index]! * inverse,
    );
    background.data[index + 1] = Math.round(
      overlay.data[index + 1]! * alpha + background.data[index + 1]! * inverse,
    );
    background.data[index + 2] = Math.round(
      overlay.data[index + 2]! * alpha + background.data[index + 2]! * inverse,
    );
    background.data[index + 3] = 255;
  }
  return PNG.sync.write(background);
}

export async function composeBrandedImage(input: {
  baseBytes: Uint8Array;
  headline: string;
  brandName: string;
  sourceLabel?: string;
  primaryColor?: string;
  accentColor?: string;
}): Promise<ComposedImage> {
  await initializeResvg();
  const font = await loadFont();
  const primary = normalizedHex(input.primaryColor ?? "", "#163E33");
  const accent = normalizedHex(input.accentColor ?? "", "#D14B2A");
  const textColor = contrast(primary, "#FFFFFF") >= 4.5 ? "#FFFFFF" : "#111111";
  const ratio = contrast(primary, textColor);
  const headline = wrapHeadline(input.headline, font);
  const brand = input.brandName.replace(/\s+/g, " ").trim().toUpperCase();
  const source = (input.sourceLabel ?? "Editorial Desk").replace(/\s+/g, " ").trim();
  const lineHeight = Math.round(headline.fontSize * 1.08);
  const startY = 190;
  const text = headline.lines
    .map(
      (line, index) =>
        `<text x="68" y="${startY + index * lineHeight}" font-family="Inter" font-size="${headline.fontSize}" font-weight="700" fill="${textColor}">${escapeXml(line)}</text>`,
    )
    .join("");
  const svg = `<svg width="${FACEBOOK_WIDTH}" height="${FACEBOOK_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="panel" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${primary}" stop-opacity="0.98"/><stop offset="78%" stop-color="${primary}" stop-opacity="0.91"/><stop offset="100%" stop-color="${primary}" stop-opacity="0"/></linearGradient></defs>
    <rect x="0" y="0" width="660" height="630" fill="url(#panel)"/>
    <rect x="68" y="132" width="86" height="8" rx="4" fill="${accent}"/>
    <text x="68" y="82" font-family="Inter" font-size="24" font-weight="700" letter-spacing="2" fill="${textColor}">${escapeXml(brand)}</text>
    ${text}
    <text x="68" y="574" font-family="Inter" font-size="20" font-weight="700" fill="${textColor}" opacity="0.82">${escapeXml(source)}</text>
    <rect x="14" y="14" width="1172" height="602" rx="16" fill="none" stroke="${accent}" stroke-width="8"/>
  </svg>`;
  const rendered = new Resvg(svg, {
    fitTo: { mode: "width", value: FACEBOOK_WIDTH },
    font: { fontBuffers: [font], defaultFontFamily: "Inter", loadSystemFonts: false },
  })
    .render()
    .asPng();
  const bytes = composite(cropToFacebook(input.baseBytes), rendered);
  const final = PNG.sync.read(Buffer.from(bytes));
  const warnings: string[] = [];
  const headlineFits =
    headline.complete &&
    headline.lines.length <= headline.maxLines &&
    headline.lines.every(
      (line) => measuredWidth(line, headline.fontSize, font) <= headline.maxWidth,
    );
  const brandLabelFits = measuredWidth(brand, 24, font) <= 530;
  const sourceLabelFits = measuredWidth(source, 20, font) <= 530;
  const lastHeadlineBaseline = startY + Math.max(0, headline.lines.length - 1) * lineHeight;
  const safeMarginsClear = lastHeadlineBaseline + Math.ceil(headline.fontSize * 0.3) <= 530;
  if (!headline.complete)
    warnings.push(
      "The complete requested headline cannot fit without truncation; no text was silently removed.",
    );
  const hasSufficientContrast = ratio >= 4.5;
  if (!headlineFits) warnings.push("Headline exceeds the measured typography box.");
  if (!brandLabelFits) warnings.push("Brand label exceeds its safe width.");
  if (!sourceLabelFits) warnings.push("Source label exceeds its safe width.");
  if (!hasSufficientContrast) warnings.push("Typography contrast is below 4.5:1.");
  const dimensionsMatch = final.width === FACEBOOK_WIDTH && final.height === FACEBOOK_HEIGHT;
  if (!dimensionsMatch) warnings.push("Final image dimensions do not match 1200×630.");
  return {
    bytes,
    layout: {
      headlineLines: headline.lines,
      fontSize: headline.fontSize,
      sourceLabel: source,
      brandLabel: brand,
      safeArea: { x: 68, y: 132, width: 530, height: 452 },
    },
    validation: {
      width: final.width,
      height: final.height,
      mimeType: "image/png",
      headlineFits,
      brandLabelFits,
      sourceLabelFits,
      safeMarginsClear,
      hasSufficientContrast,
      contrastRatio: Math.round(ratio * 100) / 100,
      autoAdjusted: headline.autoAdjusted,
      warnings,
      readyForReview:
        dimensionsMatch &&
        headlineFits &&
        brandLabelFits &&
        sourceLabelFits &&
        safeMarginsClear &&
        hasSufficientContrast,
    },
  };
}
