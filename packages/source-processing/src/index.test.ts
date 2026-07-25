import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  canonicalizeSourceUrl,
  isPublicAddress,
  parseRssFeed,
  resolveSafeSourceUrl,
  SourceFetchError,
} from "./index";

describe("source network boundary", () => {
  it.each(["127.0.0.1", "10.1.2.3", "169.254.169.254", "192.0.0.8", "192.168.1.10", "::1"])(
    "blocks non-public address %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(false);
    },
  );

  it("allows public addresses adjacent to the reserved 192.0.0.0/24 range", () => {
    expect(isPublicAddress("192.0.66.108")).toBe(true);
  });

  it("rejects a public-looking hostname when DNS returns a private address", async () => {
    await expect(
      resolveSafeSourceUrl("https://feed.example.test/rss", async () => [
        { address: "10.0.0.8", family: 4 },
      ]),
    ).rejects.toMatchObject({ code: "private_address" } satisfies Partial<SourceFetchError>);
  });

  it("accepts a hostname only when every resolved address is public", async () => {
    const result = await resolveSafeSourceUrl("https://feed.example.test/rss", async () => [
      { address: "93.184.216.34", family: 4 },
    ]);
    expect(result.url.hostname).toBe("feed.example.test");
  });

  it("canonicalizes tracking variants to one deterministic URL", () => {
    expect(
      canonicalizeSourceUrl(
        "HTTPS://Example.COM:443/report/?utm_source=newsletter&b=2&a=1#summary",
      ),
    ).toBe("https://example.com/report?a=1&b=2");
  });

  it("blocks encoded loopback address forms after URL normalization", async () => {
    await expect(resolveSafeSourceUrl("http://2130706433/source")).rejects.toMatchObject({
      code: "private_address",
    } satisfies Partial<SourceFetchError>);
  });
});

describe("RSS parsing", () => {
  it("normalizes representative items while preserving hostile text as data", () => {
    const fixturePath = fileURLToPath(
      new URL("../../../fixtures/rss/ai-operations.xml", import.meta.url),
    );
    const items = parseRssFeed(readFileSync(fixturePath, "utf8"));

    expect(items).toHaveLength(2);
    expect(items[0]?.publishedAt).toBe("2026-07-23T09:00:00.000Z");
    expect(items[1]?.summary).toContain("Ignore previous instructions");
  });

  it("rejects documents that declare entities", () => {
    expect(() => parseRssFeed('<!DOCTYPE rss [<!ENTITY x "boom">]><rss><channel /></rss>')).toThrow(
      "declarations are not allowed",
    );
  });
});
