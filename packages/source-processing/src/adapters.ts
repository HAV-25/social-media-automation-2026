import {
  sourceAdapterFailureResultSchema,
  sourceAdapterNormalizedResultSchema,
  type SourceAdapterResult,
  type SourceType,
} from "@content-engine/contracts";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import { canonicalizeSourceUrl, fetchBoundedSourceText, SourceFetchError } from "./ssrf";

type Provenance = {
  submittedBy: string;
  receivedAt: string;
  originalFilename?: string;
  originalUrl?: string;
  finalUrl?: string;
  publisher?: string;
  author?: string;
  publishedAt?: string;
  rightsNotes?: string;
};

export type ExtractedSourceResult = Exclude<SourceAdapterResult, { outcome: "raw" }>;

function cleanExtractedText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizedResult(input: {
  sourceType: SourceType;
  title: string;
  text: string;
  language: string;
  canonicalUrl?: string;
  sections?: Array<{
    index: number;
    label: string;
    text: string;
    pageStart?: number;
    pageEnd?: number;
    startMs?: number;
    endMs?: number;
  }>;
  requiresManualReview?: boolean;
  reviewReasons?: string[];
  provenance: Provenance;
}): ExtractedSourceResult {
  const cleanText = cleanExtractedText(input.text);
  if (!cleanText) {
    return failureResult(
      input.sourceType,
      "empty_content",
      "No readable source text was found.",
      false,
      input.provenance,
    );
  }
  return sourceAdapterNormalizedResultSchema.parse({
    contractVersion: "1.0",
    outcome: "normalized",
    sourceType: input.sourceType,
    title: cleanExtractedText(input.title),
    cleanText,
    contentHash: createHash("sha256").update(cleanText, "utf8").digest("hex"),
    language: input.language,
    canonicalUrl: input.canonicalUrl,
    sections: input.sections ?? [{ index: 0, label: "Source", text: cleanText }],
    requiresManualReview: input.requiresManualReview ?? false,
    reviewReasons: input.reviewReasons ?? [],
    provenance: input.provenance,
  });
}

function failureResult(
  sourceType: SourceType,
  code:
    | "invalid_input"
    | "unsupported_type"
    | "unsafe_source"
    | "too_large"
    | "fetch_failed"
    | "extraction_failed"
    | "empty_content"
    | "manual_review",
  message: string,
  retryable: boolean,
  provenance: Provenance,
): ExtractedSourceResult {
  return sourceAdapterFailureResultSchema.parse({
    contractVersion: "1.0",
    outcome: "failure",
    sourceType,
    code,
    message,
    retryable,
    provenance,
  });
}

function metadataContent($: ReturnType<typeof load>, key: string) {
  return (
    $(`meta[property="${key}"]`).attr("content") ??
    $(`meta[name="${key}"]`).attr("content") ??
    ""
  ).trim();
}

export function extractReadableHtml(input: {
  html: string;
  url: string;
  language: string;
  provenance: Provenance;
}): ExtractedSourceResult {
  const $ = load(input.html);
  $("script,style,noscript,template,svg,nav,footer,form,aside").remove();
  const title =
    metadataContent($, "og:title") || $("h1").first().text().trim() || $("title").text().trim();
  const article = $("article").first();
  const root = article.length ? article : $("main").first().length ? $("main").first() : $("body");
  const paragraphs = root
    .find("h1,h2,h3,p,li,blockquote")
    .toArray()
    .map((element) => cleanExtractedText($(element).text()))
    .filter((text) => text.length >= 20);
  const uniqueParagraphs = [...new Set(paragraphs)];
  const text = uniqueParagraphs.join("\n\n");
  return normalizedResult({
    sourceType: "url",
    title: title || new URL(input.url).hostname,
    text,
    language: input.language,
    canonicalUrl: canonicalizeSourceUrl(input.url),
    sections: uniqueParagraphs.map((paragraph, index) => ({
      index,
      label: `Block ${index + 1}`,
      text: paragraph,
    })),
    provenance: {
      ...input.provenance,
      originalUrl: input.provenance.originalUrl ?? input.url,
      publisher: input.provenance.publisher ?? (metadataContent($, "og:site_name") || undefined),
      author: input.provenance.author ?? (metadataContent($, "author") || undefined),
      publishedAt:
        input.provenance.publishedAt ?? (metadataContent($, "article:published_time") || undefined),
    },
  });
}

export async function fetchAndExtractUrl(input: {
  url: string;
  language: string;
  provenance: Provenance;
}): Promise<ExtractedSourceResult> {
  try {
    const fetched = await fetchBoundedSourceText(input.url, {
      acceptedMimeTypes: ["text/html", "application/xhtml+xml", "text/plain"],
      acceptHeader: "text/html, application/xhtml+xml, text/plain;q=0.8",
      maxBytes: 5_000_000,
    });
    if (fetched.mimeType === "text/plain") {
      return normalizedResult({
        sourceType: "url",
        title: new URL(fetched.finalUrl).hostname,
        text: fetched.text,
        language: input.language,
        canonicalUrl: canonicalizeSourceUrl(fetched.finalUrl),
        provenance: { ...input.provenance, originalUrl: input.url, finalUrl: fetched.finalUrl },
      });
    }
    return extractReadableHtml({
      html: fetched.text,
      url: fetched.finalUrl,
      language: input.language,
      provenance: { ...input.provenance, originalUrl: input.url, finalUrl: fetched.finalUrl },
    });
  } catch (error) {
    const sourceError = error instanceof SourceFetchError ? error : null;
    return failureResult(
      "url",
      sourceError?.code === "source_too_large"
        ? "too_large"
        : sourceError?.code?.includes("private") || sourceError?.code === "embedded_credentials"
          ? "unsafe_source"
          : "fetch_failed",
      sourceError?.message ?? "The URL could not be retrieved.",
      sourceError?.code === "source_timeout" || sourceError?.code === "source_http_error",
      { ...input.provenance, originalUrl: input.url },
    );
  }
}

function timestampToMs(value: string) {
  const parts = value.replace(",", ".").split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return undefined;
  const [hours = 0, minutes = 0, seconds = 0] =
    parts.length === 3 ? parts : [0, parts[0] ?? 0, parts[1] ?? 0];
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

export function extractTranscript(input: {
  text: string;
  title: string;
  language: string;
  provenance: Provenance;
}): ExtractedSourceResult {
  const lines = input.text.replace(/\r\n?/g, "\n").split("\n");
  const sections: Array<{
    index: number;
    label: string;
    text: string;
    startMs?: number;
    endMs?: number;
  }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const timing = lines[index]?.match(
      /^(\d{1,2}:\d{2}(?::\d{2})?[,.]\d{3})\s+-->\s+(\d{1,2}:\d{2}(?::\d{2})?[,.]\d{3})/,
    );
    if (!timing) continue;
    const cueLines: string[] = [];
    for (let cursor = index + 1; cursor < lines.length && lines[cursor]?.trim(); cursor += 1) {
      cueLines.push(lines[cursor] ?? "");
      index = cursor;
    }
    const text = cleanExtractedText(cueLines.join(" "));
    if (text) {
      sections.push({
        index: sections.length,
        label: `Cue ${sections.length + 1}`,
        text,
        startMs: timestampToMs(timing[1] ?? ""),
        endMs: timestampToMs(timing[2] ?? ""),
      });
    }
  }
  const text = sections.length ? sections.map((section) => section.text).join("\n") : input.text;
  return normalizedResult({
    sourceType: "transcript",
    title: input.title,
    text,
    language: input.language,
    sections: sections.length ? sections : undefined,
    provenance: input.provenance,
  });
}

export function extractPastedSocial(input: {
  text: string;
  title: string;
  language: string;
  sourceUrl?: string;
  engagement?: { reactions?: number; comments?: number; shares?: number };
  provenance: Provenance;
}): ExtractedSourceResult {
  const result = normalizedResult({
    sourceType: "social_content",
    title: input.title,
    text: input.text,
    language: input.language,
    canonicalUrl: input.sourceUrl ? canonicalizeSourceUrl(input.sourceUrl) : undefined,
    provenance: {
      ...input.provenance,
      originalUrl: input.sourceUrl ?? input.provenance.originalUrl,
    },
  });
  return result;
}

export async function extractUploadedDocument(input: {
  bytes: Uint8Array;
  mediaType: string;
  filename: string;
  language: string;
  provenance: Provenance;
}): Promise<ExtractedSourceResult> {
  const provenance = { ...input.provenance, originalFilename: input.filename };
  if (input.bytes.byteLength > 25_000_000) {
    return failureResult("pdf", "too_large", "The uploaded file exceeds 25 MB.", false, provenance);
  }
  const signature = Buffer.from(input.bytes.subarray(0, 5));
  if (input.mediaType === "application/pdf" && signature.toString("ascii") !== "%PDF-") {
    return failureResult(
      "pdf",
      "invalid_input",
      "The file signature does not match a PDF document.",
      false,
      provenance,
    );
  }
  if (
    input.mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
    signature.subarray(0, 4).toString("hex") !== "504b0304"
  ) {
    return failureResult(
      "transcript",
      "invalid_input",
      "The file signature does not match a DOCX document.",
      false,
      provenance,
    );
  }
  try {
    if (input.mediaType === "application/pdf") {
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const document = await getDocument({ data: input.bytes.slice(), useSystemFonts: true })
        .promise;
      const sections = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = cleanExtractedText(
          content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
        );
        if (text) {
          sections.push({
            index: sections.length,
            label: `Page ${pageNumber}`,
            text,
            pageStart: pageNumber,
            pageEnd: pageNumber,
          });
        }
      }
      const text = sections.map((section) => section.text).join("\n\n");
      const sparse = text.length < Math.max(80, document.numPages * 40);
      return normalizedResult({
        sourceType: "pdf",
        title: input.filename.replace(/\.pdf$/i, ""),
        text,
        language: input.language,
        sections,
        requiresManualReview: sparse,
        reviewReasons: sparse ? ["PDF has little extractable text and may require OCR."] : [],
        provenance,
      });
    }
    if (
      input.mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const { default: mammoth } = await import("mammoth");
      const extracted = await mammoth.extractRawText({ buffer: Buffer.from(input.bytes) });
      return normalizedResult({
        sourceType: "transcript",
        title: input.filename.replace(/\.docx$/i, ""),
        text: extracted.value,
        language: input.language,
        provenance,
        requiresManualReview: extracted.messages.length > 0,
        reviewReasons: extracted.messages.map((message) => message.message).slice(0, 20),
      });
    }
    if (["text/plain", "text/vtt", "application/x-subrip"].includes(input.mediaType)) {
      return extractTranscript({
        text: new TextDecoder("utf-8", { fatal: true }).decode(input.bytes),
        title: input.filename.replace(/\.(txt|vtt|srt)$/i, ""),
        language: input.language,
        provenance,
      });
    }
    return failureResult(
      "transcript",
      "unsupported_type",
      "Supported uploads are PDF, DOCX, TXT, VTT, and SRT.",
      false,
      provenance,
    );
  } catch {
    return failureResult(
      input.mediaType === "application/pdf" ? "pdf" : "transcript",
      "extraction_failed",
      "The file could not be decoded into readable text.",
      false,
      provenance,
    );
  }
}
