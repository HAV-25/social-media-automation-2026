import { describe, expect, it } from "vitest";
import { stripSourceBoilerplate } from "./adapters";

describe("stripSourceBoilerplate", () => {
  it("removes leaked analytics and comment-marker junk while keeping prose", () => {
    const dirty =
      "--> Raven.config('https://6b64f5cc8af542cbb920e0238864390a@sentry.io/147999').install(); How a Smart Recycling Robot Dismantles Old Devices";
    const clean = stripSourceBoilerplate(dirty);
    expect(clean).not.toMatch(/Raven|sentry\.io|install\(|-->/);
    expect(clean).toContain("How a Smart Recycling Robot Dismantles Old Devices");
  });

  it("strips html comments and script blocks", () => {
    const dirty = "<!-- tracking --><script>gtag('config','x');</script>Real article body here.";
    const clean = stripSourceBoilerplate(dirty);
    expect(clean).not.toMatch(/gtag|<script|tracking/);
    expect(clean).toContain("Real article body here.");
  });

  it("leaves ordinary prose untouched", () => {
    const prose = "The team shipped a new install of the system and configured it well.";
    expect(stripSourceBoilerplate(prose)).toBe(prose);
  });
});
