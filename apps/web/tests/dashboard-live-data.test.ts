import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dashboardPage = readFileSync(resolve(process.cwd(), "app/(dashboard)/page.tsx"), "utf8");

describe("live dashboard presentation", () => {
  it("renders runtime metrics instead of prototype operational figures", () => {
    expect(dashboardPage).toContain("dashboardMetrics.sourcesToday");
    expect(dashboardPage).toContain("dashboardMetrics.activeOpportunities");
    expect(dashboardPage).toContain("dashboardMetrics.researchSpendUsd");
    expect(dashboardPage).not.toContain('"14", "Sources today"');
    expect(dashboardPage).not.toContain('"$0.84", "Research spend"');
    expect(dashboardPage).not.toContain("held 11 duplicate");
    expect(dashboardPage).not.toContain("Thursday, 23 July");
  });
});
