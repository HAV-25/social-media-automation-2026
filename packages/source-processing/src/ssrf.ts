import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export type ResolvedAddress = { address: string; family: number };
export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export class SourceFetchError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function isBlockedIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return true;
  const [a = 0, b = 0] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (octets[2] ?? 0) === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(address: string) {
  const normalized = address.toLowerCase().split("%")[0] ?? "";
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice("::ffff:".length);
    return isIP(mappedIpv4) !== 4 || isBlockedIpv4(mappedIpv4);
  }
  const firstHextet = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return (
    (firstHextet & 0xfe00) === 0xfc00 ||
    (firstHextet & 0xffc0) === 0xfe80 ||
    (firstHextet & 0xff00) === 0xff00 ||
    normalized.startsWith("2001:db8:")
  );
}

export function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return !isBlockedIpv4(address);
  if (family === 6) return !isBlockedIpv6(address);
  return false;
}

const defaultResolver: HostResolver = async (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

const trackingParameterNames = new Set(["fbclid", "gclid", "mc_cid", "mc_eid", "ref", "ref_src"]);

export function canonicalizeSourceUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || trackingParameterNames.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export async function resolveSafeSourceUrl(
  value: string,
  resolver: HostResolver = defaultResolver,
) {
  let url: URL;
  try {
    url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    ) {
      url.port = "";
    }
  } catch {
    throw new SourceFetchError("invalid_url", "Source URL is invalid.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new SourceFetchError("unsupported_protocol", "Only HTTP and HTTPS sources are allowed.");
  }
  if (url.username || url.password) {
    throw new SourceFetchError("embedded_credentials", "Source URLs cannot contain credentials.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan")
  ) {
    throw new SourceFetchError("private_hostname", "Private hostnames are not allowed.");
  }

  const directFamily = isIP(hostname);
  const addresses = directFamily
    ? [{ address: hostname, family: directFamily }]
    : await resolver(hostname);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new SourceFetchError("private_address", "Source URL resolves to a non-public address.");
  }

  return { addresses, url };
}

export async function fetchBoundedSourceText(
  value: string,
  {
    acceptHeader = "application/rss+xml, application/atom+xml, application/xml, text/xml",
    acceptedMimeTypes = [
      "application/atom+xml",
      "application/rss+xml",
      "application/xml",
      "text/xml",
    ],
    maxBytes = 2_000_000,
    maxRedirects = 5,
    resolver = defaultResolver,
    timeoutMs = 15_000,
  }: {
    acceptHeader?: string;
    acceptedMimeTypes?: string[];
    maxBytes?: number;
    maxRedirects?: number;
    resolver?: HostResolver;
    timeoutMs?: number;
  } = {},
) {
  let currentUrl = value;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const { addresses, url } = await resolveSafeSourceUrl(currentUrl, resolver);
    const selected = addresses[0];
    if (!selected) throw new SourceFetchError("dns_empty", "Source hostname did not resolve.");

    const response = await new Promise<{
      body: Buffer;
      headers: Record<string, string | string[] | undefined>;
      statusCode: number;
    }>((resolve, reject) => {
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
        {
          family: selected.family,
          headers: {
            Accept: acceptHeader,
            "Accept-Encoding": "identity",
            Host: url.host,
            "User-Agent": "AI-Social-Content-Engine/0.1",
          },
          hostname: selected.address,
          method: "GET",
          path: `${url.pathname}${url.search}`,
          port: url.port || undefined,
          protocol: url.protocol,
          servername: url.protocol === "https:" ? url.hostname : undefined,
          timeout: timeoutMs,
        },
        (incoming) => {
          const chunks: Buffer[] = [];
          let received = 0;
          incoming.on("data", (chunk: Buffer) => {
            received += chunk.length;
            if (received > maxBytes) {
              incoming.destroy(
                new SourceFetchError(
                  "source_too_large",
                  "Source exceeded the configured byte limit.",
                ),
              );
              return;
            }
            chunks.push(chunk);
          });
          incoming.on("end", () => {
            resolve({
              body: Buffer.concat(chunks),
              headers: incoming.headers,
              statusCode: incoming.statusCode ?? 0,
            });
          });
          incoming.on("error", reject);
        },
      );
      request.on("timeout", () => {
        request.destroy(new SourceFetchError("source_timeout", "Source request timed out."));
      });
      request.on("error", reject);
      request.end();
    });

    if (response.statusCode >= 300 && response.statusCode < 400) {
      const location = response.headers.location;
      if (!location || Array.isArray(location)) {
        throw new SourceFetchError("invalid_redirect", "Source returned an invalid redirect.");
      }
      currentUrl = new URL(location, url).toString();
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new SourceFetchError("source_http_error", "Source returned an unsuccessful status.");
    }

    const contentLength = Number(response.headers["content-length"] ?? "0");
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new SourceFetchError("source_too_large", "Source exceeded the configured byte limit.");
    }
    const contentType = String(response.headers["content-type"] ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    const allowedTypes = new Set(acceptedMimeTypes);
    if (!contentType || !allowedTypes.has(contentType)) {
      throw new SourceFetchError("unsupported_mime", "Source is not an RSS or Atom document.");
    }

    return {
      finalUrl: url.toString(),
      mimeType: contentType,
      text: new TextDecoder("utf-8", { fatal: true }).decode(response.body),
    };
  }

  throw new SourceFetchError("too_many_redirects", "Source exceeded the redirect limit.");
}
