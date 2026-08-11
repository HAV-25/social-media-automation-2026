import { PNG } from "npm:pngjs@7.0.0";
import { composeBrandedImage, FACEBOOK_HEIGHT, FACEBOOK_WIDTH } from "./image-runtime.ts";

Deno.test("composes and validates a deterministic 1200x630 branded image", async () => {
  const base = new PNG({ width: 1536, height: 1024 });
  for (let index = 0; index < base.data.length; index += 4) {
    base.data[index] = 24;
    base.data[index + 1] = 82;
    base.data[index + 2] = 96;
    base.data[index + 3] = 255;
  }
  const result = await composeBrandedImage({
    baseBytes: PNG.sync.write(base),
    headline: "Industrial robotics moves from pilot projects to measurable operations",
    brandName: "Klaank",
    sourceLabel: "The Robot Report",
    primaryColor: "#163E33",
    accentColor: "#D14B2A",
  });
  const final = PNG.sync.read(result.bytes);
  if (final.width !== FACEBOOK_WIDTH || final.height !== FACEBOOK_HEIGHT) {
    throw new Error("Unexpected final image dimensions.");
  }
  if (!result.validation.readyForReview || !result.validation.headlineFits) {
    throw new Error(JSON.stringify(result.validation));
  }
});

Deno.test("never silently truncates and certifies an unfit requested headline", async () => {
  const base = new PNG({ width: 1536, height: 1024 });
  base.data.fill(80);
  for (let index = 3; index < base.data.length; index += 4) base.data[index] = 255;
  const requested =
    `KUKA deploys Automation Management Platform for North American automakers ${"with independently reviewable operational evidence ".repeat(12)}`.trim();
  const result = await composeBrandedImage({
    baseBytes: PNG.sync.write(base),
    headline: requested,
    brandName: "Klaank",
    sourceLabel: "The Robot Report",
  });
  const rendered = result.layout.headlineLines.join(" ");
  if (result.validation.readyForReview || result.validation.headlineFits) {
    throw new Error("An unfit headline was incorrectly certified.");
  }
  if (
    rendered !== requested ||
    !result.validation.warnings.some((warning) => /silently removed/i.test(warning))
  ) {
    throw new Error("The requested headline was truncated without an explicit validation failure.");
  }
});
