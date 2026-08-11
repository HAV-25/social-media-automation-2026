import { XMLParser, XMLValidator } from "npm:fast-xml-parser@5.10.1";
import { z } from "npm:zod@4.0.17";
import { WorkerHttpError } from "./worker-auth.ts";

const MAX_DOCUMENT_BYTES = 2_000_000;
const MAX_ITEMS = 20;
const FETCH_TIMEOUT_MS = 20_000;

export const rssItemSchema = z.object({
  author: z.string().max(500).optional(),
  canonicalUrl: z.url().max(4096).optional(),
  guid: z.string().min(1).max(4096),
  publishedAt: z.iso.datetime().optional(),
  summary: z.string().max(120_000).optional(),
  title: z.string().min(1).max(1000),
});
export type RssItem = z.infer<typeof rssItemSchema>;

type BrandPolicy = {
  audienceDefinition: string;
  positioning: string;
  contentPillars: string[];
  restrictedTopics: string[];
};

function arrayify<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return textValue(record["#text"] ?? record.__cdata ?? record._);
}

function atomLink(value: unknown): string | undefined {
  for (const candidate of arrayify(value)) {
    if (typeof candidate === "string") return candidate;
    if (candidate && typeof candidate === "object") {
      const record = candidate as Record<string, unknown>;
      if (!record["@_rel"] || record["@_rel"] === "alternate") {
        const href = textValue(record["@_href"]);
        if (href) return href;
      }
    }
  }
  return undefined;
}

function isoDate(value: unknown): string | undefined {
  const text = textValue(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function parseRss(xml: string): RssItem[] {
  if (new TextEncoder().encode(xml).length > MAX_DOCUMENT_BYTES) {
    throw new WorkerHttpError(
      422,
      "rss_document_too_large",
      "RSS document exceeds the safe limit.",
    );
  }
  if (/<!doctype|<!entity/i.test(xml)) {
    throw new WorkerHttpError(422, "rss_declaration_rejected", "RSS declarations are not allowed.");
  }
  if (XMLValidator.validate(xml) !== true) {
    throw new WorkerHttpError(422, "rss_xml_invalid", "RSS document is not valid XML.");
  }
  const parsed = new XMLParser({
    attributeNamePrefix: "@_",
    ignoreAttributes: false,
    parseAttributeValue: false,
    parseTagValue: false,
    processEntities: false,
    textNodeName: "#text",
    trimValues: true,
  }).parse(xml) as Record<string, unknown>;
  const channel = (parsed.rss as { channel?: Record<string, unknown> } | undefined)?.channel;
  const atom = parsed.feed as Record<string, unknown> | undefined;
  const rawItems = channel ? arrayify(channel.item) : arrayify(atom?.entry);
  return rawItems.slice(0, MAX_ITEMS).map((raw) => {
    const item = raw as Record<string, unknown>;
    const link = channel ? textValue(item.link) : atomLink(item.link);
    return rssItemSchema.parse({
      author: textValue(item.author ?? item["dc:creator"]),
      canonicalUrl: link,
      guid: textValue(item.guid ?? item.id) ?? link,
      publishedAt: isoDate(item.pubDate ?? item.published ?? item.updated),
      summary: textValue(
        item.description ?? item.summary ?? item.content ?? item["content:encoded"],
      ),
      title: textValue(item.title),
    });
  });
}

function isPrivateIpv4(value: string): boolean {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return false;
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIpv6(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WorkerHttpError(422, "source_url_invalid", "Source URL is invalid.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  ) {
    throw new WorkerHttpError(422, "source_url_rejected", "Source URL is not permitted.");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    isPrivateIpv4(host) ||
    isPrivateIpv6(host)
  ) {
    throw new WorkerHttpError(422, "source_host_rejected", "Source host is not public.");
  }
  if (!/^\d+(?:\.\d+){3}$/.test(host) && !host.includes(":")) {
    const addresses = await Promise.allSettled([
      Deno.resolveDns(host, "A"),
      Deno.resolveDns(host, "AAAA"),
    ]);
    const values = addresses.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
    if (
      !values.length ||
      values.some((address) => isPrivateIpv4(address) || isPrivateIpv6(address))
    ) {
      throw new WorkerHttpError(422, "source_dns_rejected", "Source host did not resolve safely.");
    }
  }
  return url;
}

async function readBounded(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_DOCUMENT_BYTES)
    throw new WorkerHttpError(
      422,
      "source_document_too_large",
      "Source document exceeds the safe limit.",
    );
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > MAX_DOCUMENT_BYTES) {
      await reader.cancel();
      throw new WorkerHttpError(
        422,
        "source_document_too_large",
        "Source document exceeds the safe limit.",
      );
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function safeFetchText(
  rawUrl: string,
): Promise<{ text: string; finalUrl: string; contentType: string }> {
  let url = await assertPublicUrl(rawUrl);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": "EditorialDesk/1.0 (+internal content research)" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === 3)
        throw new WorkerHttpError(
          422,
          "source_redirect_rejected",
          "Source redirect chain is invalid.",
        );
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok)
      throw new WorkerHttpError(
        502,
        "source_fetch_failed",
        `Source returned HTTP ${response.status}.`,
      );
    return {
      text: await readBounded(response),
      finalUrl: url.toString(),
      contentType: response.headers.get("content-type") ?? "",
    };
  }
  throw new WorkerHttpError(422, "source_redirect_rejected", "Source redirect chain is invalid.");
}

export function stripMarkup(value: string): string {
  // Control characters are intentionally stripped from hostile feed and page text.
  // eslint-disable-next-line no-control-regex
  const unsafeControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200d\u2060\ufeff]/g;
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .normalize("NFKC")
    .replace(unsafeControls, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120_000);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
function clamp(value: number, maximum: number): number {
  return round(Math.max(0, Math.min(maximum, value)));
}
function terms(values: string[]): string[] {
  return [
    ...new Set(
      values
        .flatMap((value) => value.toLocaleLowerCase("en").split(/[^\p{L}\p{N}]+/u))
        .filter((term) => term.length >= 4),
    ),
  ];
}

export function scoreOpportunity(cleanText: string, policy: BrandPolicy) {
  const lower = cleanText.toLocaleLowerCase("en");
  const words = lower.match(/\b[\p{L}\p{N}'’-]+\b/gu) ?? [];
  const sentences = cleanText.split(/[.!?]+/).filter((sentence) => sentence.trim());
  const policyTerms = terms([
    policy.audienceDefinition,
    policy.positioning,
    ...policy.contentPillars,
  ]);
  const relevant = policyTerms.filter((term) => lower.includes(term)).length;
  const relevanceRatio = policyTerms.length ? relevant / policyTerms.length : 0;
  const usefulness = (
    lower.match(
      /\b(?:how|why|because|therefore|means|should|can|framework|lesson|step|impact)\b/g,
    ) ?? []
  ).length;
  const evidence =
    (cleanText.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? []).length +
    (cleanText.match(/https?:\/\//g) ?? []).length * 2;
  const conversation =
    (cleanText.match(/\?/g) ?? []).length +
    (
      lower.match(
        /\b(?:but|however|instead|what if|the question|trade-off|tradeoff|agree|disagree)\b/g,
      ) ?? []
    ).length;
  const average = words.length / Math.max(1, sentences.length);
  const values = {
    newsOrLearningValue: clamp(6 + Math.log2(Math.max(1, words.length / 40)) * 3, 18),
    audienceRelevance: clamp(relevanceRatio * 16 + Math.min(4, relevant), 16),
    consequenceOrUsefulness: clamp(4 + usefulness * 1.5, 14),
    novelty: clamp(7 + Math.min(5, (new Set(words).size / Math.max(1, words.length)) * 8), 12),
    evidenceStrength: clamp(Math.min(12, evidence * 2.25), 12),
    shareability: clamp(average >= 8 && average <= 26 ? 8 : 5, 10),
    conversationPotential: clamp(2 + conversation * 1.5, 8),
    brandAuthorityFit: clamp(relevanceRatio * 6 + (relevant > 0 ? 1 : 0), 6),
    timeliness: 2,
  };
  const restricted = policy.restrictedTopics.filter((topic) =>
    lower.includes(topic.toLocaleLowerCase("en")),
  );
  const certainty =
    lower.match(/\b(?:guaranteed|always|never fails|certain to|will definitely)\b/g) ?? [];
  const riskPenalty = Math.min(30, restricted.length * 15 + certainty.length * 8);
  const grossScore = round(Object.values(values).reduce((sum, value) => sum + value, 0));
  const dimension = (score: number, maximum: number, reason: string) => ({
    score,
    maximum,
    reason,
  });
  return {
    contractVersion: "1.0",
    dimensions: {
      newsOrLearningValue: dimension(
        values.newsOrLearningValue,
        18,
        `${words.length} normalized words.`,
      ),
      audienceRelevance: dimension(
        values.audienceRelevance,
        16,
        `${relevant} of ${policyTerms.length} brand terms matched.`,
      ),
      consequenceOrUsefulness: dimension(
        values.consequenceOrUsefulness,
        14,
        `${usefulness} usefulness signals.`,
      ),
      novelty: dimension(values.novelty, 12, "Preliminary lexical novelty."),
      evidenceStrength: dimension(
        values.evidenceStrength,
        12,
        `${evidence} evidence signals; claims remain unverified.`,
      ),
      shareability: dimension(
        values.shareability,
        10,
        `Average sentence length ${round(average)} words.`,
      ),
      conversationPotential: dimension(
        values.conversationPotential,
        8,
        `${conversation} conversation signals.`,
      ),
      brandAuthorityFit: dimension(values.brandAuthorityFit, 6, "Explicit brand-context overlap."),
      timeliness: dimension(values.timeliness, 4, "Neutral preliminary timeliness."),
    },
    grossScore,
    riskPenalty,
    finalScore: clamp(grossScore - riskPenalty, 100),
    riskReasons: [
      ...restricted.map((topic) => `Restricted topic matched: ${topic}`),
      ...(certainty.length ? ["Unsupported certainty language detected."] : []),
    ],
  };
}

export function classify(cleanText: string, policy: BrandPolicy) {
  const lower = cleanText.toLocaleLowerCase("en");
  const topicTags = policy.contentPillars
    .filter((pillar) => terms([pillar]).some((term) => lower.includes(term)))
    .slice(0, 8);
  const namedEntities = [
    ...new Set(
      cleanText.match(
        /\b(?:[A-Z]{2,8}|[A-Z][\p{L}\p{N}&.-]+(?:\s+[A-Z][\p{L}\p{N}&.-]+){0,3})\b/gu,
      ) ?? [],
    ),
  ].slice(0, 20);
  const news = (
    lower.match(
      /\b(?:announce|announced|announcement|launch|launched|new|today|reported|study|202[0-9])\b/g,
    ) ?? []
  ).length;
  const education = (
    lower.match(/\b(?:how|why|framework|lesson|steps?|guide|because|means)\b/g) ?? []
  ).length;
  const perspective =
    (cleanText.match(/\?/g) ?? []).length +
    (lower.match(/\b(?:but|however|instead|trade-?off|the question)\b/g) ?? []).length;
  const ranked = [
    { style: "newsworthy_authority", score: news },
    { style: "educational_breakdown", score: education },
    { style: "perspective_conversation", score: perspective },
  ].sort((a, b) => b.score - a.score);
  const winner = ranked[0]?.score ? ranked[0] : { style: "perspective_conversation", score: 0 };
  return {
    namedEntities,
    topicTags,
    recommendedStyle: winner.style,
    reasons: [`${winner.score} dominant style signals`, `${namedEntities.length} named entities`],
  };
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function clusterKey(title: string): Promise<string> {
  const significant = terms([title])
    .filter((term) => !["with", "from", "that", "this", "their", "about"].includes(term))
    .sort()
    .slice(0, 12);
  return sha256(significant.join(":") || title.toLocaleLowerCase("en"));
}
