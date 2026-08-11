import { canonicalCitationUrl } from "./openai-runtime.ts";

Deno.test("canonicalizes observed citation URLs without broadening their origin", () => {
  const actual = canonicalCitationUrl(
    "https://EXAMPLE.com:443/report/?utm_source=search&b=2&a=1#evidence",
  );
  if (actual !== "https://example.com/report?a=1&b=2") {
    throw new Error(`Unexpected canonical URL: ${actual}`);
  }
  if (canonicalCitationUrl("http://example.com/report") !== null) {
    throw new Error("Non-HTTPS evidence was accepted.");
  }
});
