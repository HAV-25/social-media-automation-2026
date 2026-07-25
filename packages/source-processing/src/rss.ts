import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";

const rssItemSchema = z.object({
  author: z.string().optional(),
  canonicalUrl: z.url().optional(),
  guid: z.string().min(1),
  publishedAt: z.iso.datetime().optional(),
  summary: z.string().optional(),
  title: z.string().min(1),
});
export type ParsedRssItem = z.infer<typeof rssItemSchema>;

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

function atomLink(value: unknown) {
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

function isoDate(value: unknown) {
  const text = textValue(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function parseRssFeed(xml: string): ParsedRssItem[] {
  if (xml.length > 2_000_000) throw new Error("RSS document exceeds the parser limit.");
  if (/<!doctype|<!entity/i.test(xml)) {
    throw new Error("RSS document declarations are not allowed.");
  }
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new Error("RSS document is not valid XML.");

  const parser = new XMLParser({
    attributeNamePrefix: "@_",
    ignoreAttributes: false,
    parseAttributeValue: false,
    parseTagValue: false,
    processEntities: false,
    textNodeName: "#text",
    trimValues: true,
  });
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const rssChannel = (parsed.rss as { channel?: Record<string, unknown> } | undefined)?.channel;
  const atomFeed = parsed.feed as Record<string, unknown> | undefined;
  const rawItems = rssChannel ? arrayify(rssChannel.item) : arrayify(atomFeed?.entry);

  return rawItems.slice(0, 1000).map((rawItem) => {
    const item = rawItem as Record<string, unknown>;
    const link = rssChannel ? textValue(item.link) : atomLink(item.link);
    const guid = textValue(item.guid ?? item.id) ?? link;
    const title = textValue(item.title);
    if (!guid || !title) throw new Error("RSS item is missing a title or stable identifier.");

    return rssItemSchema.parse({
      author: textValue(item.author ?? item["dc:creator"]),
      canonicalUrl: link,
      guid,
      publishedAt: isoDate(item.pubDate ?? item.published ?? item.updated),
      summary: textValue(
        item.description ?? item.summary ?? item.content ?? item["content:encoded"],
      ),
      title,
    });
  });
}
