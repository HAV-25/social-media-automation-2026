function addOrigin(origins: Set<string>, value: string | null | undefined) {
  if (!value) return;
  try {
    origins.add(new URL(value).origin);
  } catch {
    // Invalid proxy or environment values are never trusted.
  }
}

function forwardedOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  if (!host) return null;

  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || new URL(request.url).protocol.replace(":", "");
  if (protocol !== "http" && protocol !== "https") return null;

  return `${protocol}://${host}`;
}

export function isSameOriginRequest(request: Request) {
  const suppliedOrigin = request.headers.get("origin");
  if (!suppliedOrigin) return true;

  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(suppliedOrigin).origin;
  } catch {
    return false;
  }

  const trustedOrigins = new Set<string>();
  addOrigin(trustedOrigins, request.url);
  addOrigin(trustedOrigins, forwardedOrigin(request));
  addOrigin(trustedOrigins, process.env.NEXT_PUBLIC_APP_URL);
  return trustedOrigins.has(normalizedOrigin);
}
