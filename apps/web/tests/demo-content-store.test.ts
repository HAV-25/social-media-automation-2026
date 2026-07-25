import { describe, expect, it } from "vitest";
import {
  parseDemoDraftRecords,
  parseDemoResearchRecords,
  serializeDemoDraftRecords,
  serializeDemoResearchRecords,
  type DemoDraftRecord,
  type DemoResearchRecord,
} from "../lib/demo-content-store";

describe("demo draft storage", () => {
  it("round-trips a complete draft record without losing its version", () => {
    const record: DemoDraftRecord = {
      postDraftId: "0f7b707d-82fe-43e5-a6ea-6a233e510eed",
      postVersionId: "5ce2a02d-639a-4a0f-923b-133114e19ea9",
      versionNumber: 1,
      generationRunId: "1ef663db-d0a1-45d4-87ed-108186b3f7c5",
      opportunityId: "60703d66-9f65-421f-8124-85973f12ba65",
      brandId: "96362d88-d4c0-4e9f-a450-2267a0215656",
      contentStyle: "educational_breakdown",
      tone: "thoughtful",
      status: "ready_for_review",
      angles: [
        {
          angleKey: "angle_newsworthy1",
          title: "What changed",
          thesis:
            "Explain what changed and why the practical consequence matters to this audience.",
          contentStyle: "newsworthy_authority",
          intendedReaction: "Understand the consequence.",
          supportingClaimKeys: [],
          score: 82,
          rankExplanation: "A timely route grounded in the available evidence package.",
        },
        {
          angleKey: "angle_educational1",
          title: "Decision framework",
          thesis:
            "Turn the evidence into a practical framework the audience can apply immediately.",
          contentStyle: "educational_breakdown",
          intendedReaction: "Apply the framework.",
          supportingClaimKeys: [],
          score: 84,
          rankExplanation: "The strongest route for reusable, evidence-aware learning.",
        },
        {
          angleKey: "angle_perspective1",
          title: "Less obvious shift",
          thesis: "Offer a clearly marked interpretation and invite a useful audience response.",
          contentStyle: "perspective_conversation",
          intendedReaction: "Discuss the interpretation.",
          supportingClaimKeys: [],
          score: 78,
          rankExplanation: "A discussion route that preserves the boundary around the evidence.",
        },
      ],
      selectedAngleKey: "angle_educational1",
      content: {
        hook: "One decision can change the operating model.",
        body: "Redesign accountability before automating the work.",
        closing: "Which decision would you redesign first?",
        fullText:
          "One decision can change the operating model.\n\nRedesign accountability before automating the work.\n\nWhich decision would you redesign first?",
      },
      versions: [
        {
          id: "5ce2a02d-639a-4a0f-923b-133114e19ea9",
          versionNumber: 1,
          content: {
            hook: "One decision can change the operating model.",
            body: "Redesign accountability before automating the work.",
            closing: "Which decision would you redesign first?",
            fullText:
              "One decision can change the operating model.\n\nRedesign accountability before automating the work.\n\nWhich decision would you redesign first?",
          },
          generationType: "initial",
          createdAt: "2026-07-23T12:00:00.000Z",
        },
      ],
      evaluation: {
        contractVersion: "1.0",
        evidenceScore: 80,
        brandFitScore: 78,
        qualityScore: 79,
        sourceSimilarity: 0.2,
        sameBrandSimilarity: 0.1,
        crossBrandSimilarity: 0.1,
        hookReuseSimilarity: 0.1,
        unsupportedHighRiskClaims: 0,
        contradictions: 0,
        prohibitedPhrases: [],
        restrictedTopics: [],
        cliches: [],
        warnings: [],
        sentenceClaims: [
          {
            sentence: "One decision can change the operating model.",
            claimKeys: [],
            state: "interpretation",
          },
        ],
        readyForReview: true,
      },
      revisionCount: 0,
      model: "fake-editorial-v1",
      promptVersion: "facebook-writer.v1",
      responseId: "fake-response-1",
      inputTokens: 42,
      outputTokens: 31,
      feedback: [],
      createdAt: "2026-07-23T12:00:00.000Z",
    };

    expect(parseDemoDraftRecords(serializeDemoDraftRecords([record]))).toEqual([record]);
  });

  it("round-trips a strict simulated evidence package", () => {
    const record: DemoResearchRecord = {
      opportunityId: "60703d66-9f65-421f-8124-85973f12ba65",
      researchRunId: "0f7b707d-82fe-43e5-a6ea-6a233e510eed",
      generationRunId: "1ef663db-d0a1-45d4-87ed-108186b3f7c5",
      evidencePackage: {
        contractVersion: "1.0",
        opportunityId: "60703d66-9f65-421f-8124-85973f12ba65",
        summary: "The submitted source supports an interpretation with a visible caveat.",
        sources: [
          {
            sourceKey: "source_original1",
            url: "https://example.test/source",
            title: "Submitted source",
            publisher: "Editorial team",
            publishedAt: null,
            retrievedAt: "2026-07-23T12:00:00.000Z",
            sourceType: "source_material",
            authorityScore: 50,
            relevantExcerpt: "An internal observation.",
          },
        ],
        claims: [],
        conflicts: [],
        caveats: ["External verification has not run."],
        readyForWriting: true,
      },
      model: "fake-research-v1",
      promptVersion: "evidence-synthesizer.v1",
      responseId: "fake-research-response",
      usage: {
        inputTokens: 20,
        outputTokens: 30,
        webSearchCalls: 0,
        estimatedCostUsd: 0,
      },
      createdAt: "2026-07-23T12:00:00.000Z",
    };

    expect(parseDemoResearchRecords(serializeDemoResearchRecords([record]))).toEqual([record]);
  });
});
