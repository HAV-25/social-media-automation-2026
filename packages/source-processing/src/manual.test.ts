import { describe, expect, it } from "vitest";
import { classifyNormalizedSource, normalizeManualInput, scoreManualOpportunity } from "./manual";

const policy = {
  audienceDefinition: "Business leaders adopting artificial intelligence",
  positioning: "Practical AI operating model guidance",
  contentPillars: ["AI operations", "Governance"],
  restrictedTopics: ["Guaranteed investment returns"],
};

describe("manual input normalization and scoring", () => {
  it("normalizes equivalent whitespace to the same content hash", () => {
    const first = normalizeManualInput({
      title: "  AI   operating note ",
      language: "en",
      text: "AI operations improve when teams redesign decisions.\r\n\r\nGovernance matters.",
    });
    const second = normalizeManualInput({
      title: "AI operating note",
      language: "en",
      text: "AI operations improve when teams redesign decisions.\n\nGovernance matters.",
    });

    expect(first.contentHash).toBe(second.contentHash);
    expect(first.title).toBe("AI operating note");
    expect(first.valueNucleus).toBe("AI operations improve when teams redesign decisions.");
  });

  it("removes unsafe control and invisible formatting characters", () => {
    const normalized = normalizeManualInput({
      title: "Safe title",
      language: "en",
      text: "Account\u0000ability\u200B remains visible.\tEvidence stays readable.",
    });

    expect(normalized.cleanText).toBe("Accountability remains visible. Evidence stays readable.");
  });

  it("strips RSS markup when explicitly requested", () => {
    const normalized = normalizeManualInput({
      language: "en",
      title: "Robotics update",
      text: '<p>Robotics evidence</p><img src="https://untrusted.example/x.png"><br>for buyers.',
      stripMarkup: true,
    });

    expect(normalized.cleanText).toBe("Robotics evidence\n\nfor buyers.");
    expect(normalized.cleanText).not.toContain("<img");
  });

  it("stores transparent arithmetic whose dimensions total the gross score", () => {
    const score = scoreManualOpportunity({
      cleanText:
        "Why do AI operating models matter? Leaders can redesign decisions because governance clarifies accountability. A 2026 review covered 24 teams.",
      policy,
    });
    const sum = Object.values(score.dimensions).reduce(
      (total, dimension) => total + dimension.score,
      0,
    );

    expect(score.grossScore).toBeCloseTo(sum, 2);
    expect(score.finalScore).toBe(score.grossScore - score.riskPenalty);
    expect(score.dimensions.audienceRelevance.reason).toContain("matched");
  });

  it("applies a separate bounded risk penalty", () => {
    const score = scoreManualOpportunity({
      cleanText:
        "Guaranteed investment returns are certain to happen. This will definitely never fail.",
      policy,
    });

    expect(score.riskPenalty).toBe(30);
    expect(score.riskReasons.length).toBeGreaterThan(1);
    expect(score.finalScore).toBeGreaterThanOrEqual(0);
  });

  it("deterministically extracts topics, entities, and a recommended style", () => {
    const result = classifyNormalizedSource({
      cleanText:
        "OpenAI announced a 2026 AI governance study. The report explains how leadership teams can clarify decision rights.",
      policy,
    });

    expect(result.namedEntities).toContain("OpenAI");
    expect(result.topicTags).toContain("Governance");
    expect(result.topicTags).toContain("AI governance");
    expect(result.recommendedStyle).toBe("newsworthy_authority");
    expect(result.reasons).toHaveLength(2);
  });
});
