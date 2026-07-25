import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { buildLeanResearchPlan, FakeResearchProvider } from "./research";
import { DEFAULT_RESEARCH_EVAL_THRESHOLDS, evaluateResearchResult } from "./evals";

const evalCasesSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      category: z.enum([
        "straightforward",
        "stale",
        "disputed",
        "numerical",
        "opinion",
        "promotional",
        "prompt_injection",
      ]),
      title: z.string().min(1),
      sourceText: z.string().min(20),
      expectedRiskSignal: z.boolean(),
    }),
  )
  .length(7);

const fixturePath = fileURLToPath(
  new URL("../../../fixtures/evals/research-cases.json", import.meta.url),
);
const evalCases = evalCasesSchema.parse(JSON.parse(readFileSync(fixturePath, "utf8")));

describe("research evaluation corpus", () => {
  it("covers every required evidence-risk category exactly once", () => {
    expect(new Set(evalCases.map((item) => item.category))).toEqual(
      new Set([
        "straightforward",
        "stale",
        "disputed",
        "numerical",
        "opinion",
        "promotional",
        "prompt_injection",
      ]),
    );
  });

  it("keeps the deterministic provider above the contract-safety and cost baselines", async () => {
    const provider = new FakeResearchProvider();
    const reports = await Promise.all(
      evalCases.map(async (item, index) => {
        const opportunityId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
        const plan = buildLeanResearchPlan({
          opportunityId,
          sourceTitle: item.title,
          valueNucleus: item.sourceText,
          budget: {
            maxQueries: 3,
            maxDomains: 12,
            maxResults: 20,
            maxElapsedMs: 60_000,
            maxOutputTokens: 5_000,
            maxCostUsd: DEFAULT_RESEARCH_EVAL_THRESHOLDS.maximumCostUsd,
          },
        });
        const result = await provider.research({
          plan,
          sourceTitle: item.title,
          sourceText: item.sourceText,
        });
        return evaluateResearchResult(result);
      }),
    );

    expect(reports.every((report) => report.passed)).toBe(true);
    expect(Math.min(...reports.map((report) => report.evidenceCoverage))).toBeGreaterThanOrEqual(
      DEFAULT_RESEARCH_EVAL_THRESHOLDS.minimumEvidenceCoverage,
    );
    expect(Math.max(...reports.map((report) => report.estimatedCostUsd))).toBe(0);
  });
});
