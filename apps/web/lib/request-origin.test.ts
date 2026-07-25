import { afterEach, describe, expect, it } from "vitest";
import { isSameOriginRequest } from "./request-origin";

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
});

describe("same-origin mutation protection", () => {
  it("accepts a direct same-origin request", () => {
    const request = new Request("https://appsbrite-social.netlify.app/api/rss-intake/run", {
      headers: { origin: "https://appsbrite-social.netlify.app" },
    });
    expect(isSameOriginRequest(request)).toBe(true);
  });

  it("accepts the public origin forwarded by Netlify", () => {
    const request = new Request("https://internal-host/api/rss-intake/run", {
      headers: {
        origin: "https://appsbrite-social.netlify.app",
        "x-forwarded-host": "appsbrite-social.netlify.app",
        "x-forwarded-proto": "https",
      },
    });
    expect(isSameOriginRequest(request)).toBe(true);
  });

  it("accepts the configured production application origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://appsbrite-social.netlify.app";
    const request = new Request("http://localhost:3000/api/rss-intake/run", {
      headers: { origin: "https://appsbrite-social.netlify.app" },
    });
    expect(isSameOriginRequest(request)).toBe(true);
  });

  it("rejects an unrelated or malformed origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://appsbrite-social.netlify.app";
    expect(
      isSameOriginRequest(
        new Request("https://appsbrite-social.netlify.app/api/rss-intake/run", {
          headers: { origin: "https://attacker.example" },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        new Request("https://appsbrite-social.netlify.app/api/rss-intake/run", {
          headers: { origin: "not a URL" },
        }),
      ),
    ).toBe(false);
  });

  it("retains support for signed or non-browser clients without Origin", () => {
    expect(
      isSameOriginRequest(new Request("https://appsbrite-social.netlify.app/api/rss-intake/run")),
    ).toBe(true);
  });
});
