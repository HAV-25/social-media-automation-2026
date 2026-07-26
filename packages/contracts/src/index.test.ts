import { describe, expect, it } from "vitest";
import {
  contentStyleSchema,
  editorialWorkflowRequestSchema,
  evidencePackageSchema,
  fakeDraftOutputSchema,
  manualInputRequestSchema,
  organizationRoleSchema,
  postActionWorkflowRequestSchema,
  postVerificationWorkflowRequestSchema,
  researchPlanSchema,
  serverEnvSchema,
  rssIntakeContractSchema,
  rssFeedUpsertRequestSchema,
  rssFeedPlanSchema,
  rssManualRunRequestSchema,
  rssManualRunResultSchema,
  rssGenerationReservationRequestSchema,
  rssSourceAnalysisRequestSchema,
  rssSourceAnalysisResultSchema,
  sourceAdapterResultSchema,
  validateEvidencePackageIntegrity,
  workflowRecoveryExecutionSchema,
  workflowRecoveryFailureSchema,
} from "./index";

describe("shared contracts", () => {
  it("uses a bounded three-item RSS catch-up window by default", () => {
    expect(serverEnvSchema.parse({}).RSS_ITEMS_PER_FEED_PER_RUN).toBe(3);
    expect(serverEnvSchema.safeParse({ RSS_ITEMS_PER_FEED_PER_RUN: 21 }).success).toBe(false);
  });

  it("accepts every Phase 1 role and content style", () => {
    expect(organizationRoleSchema.parse("reviewer")).toBe("reviewer");
    expect(contentStyleSchema.parse("perspective_conversation")).toBe("perspective_conversation");
  });

  it("rejects a retriable workflow request without an idempotency key", () => {
    const result = rssIntakeContractSchema.safeParse({
      contractVersion: "1.0",
      correlationId: "00000000-0000-4000-8000-000000000001",
      feedId: "00000000-0000-4000-8000-000000000002",
      requestedAt: "2026-07-23T12:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });

  it("validates bounded editorial workflow requests and rejects duplicate styles", () => {
    const envelope = {
      contractVersion: "1.0" as const,
      correlationId: "00000000-0000-4000-8000-000000000001",
      idempotencyKey: "editorial-workflow-request-0001",
      actorId: "00000000-0000-4000-8000-000000000002",
      brandId: "00000000-0000-4000-8000-000000000003",
      requestedAt: "2026-07-24T10:00:00.000Z",
    };
    const generation = editorialWorkflowRequestSchema.parse({
      ...envelope,
      opportunityId: "00000000-0000-4000-8000-000000000004",
      contentStyles: ["newsworthy_authority", "educational_breakdown"],
      tone: "thoughtful",
    });
    expect(generation.contentStyles).toHaveLength(2);
    expect(
      editorialWorkflowRequestSchema.safeParse({
        ...generation,
        contentStyles: ["newsworthy_authority", "newsworthy_authority"],
      }).success,
    ).toBe(false);
    expect(
      postVerificationWorkflowRequestSchema.safeParse({
        ...envelope,
        postDraftId: "00000000-0000-4000-8000-000000000005",
      }).success,
    ).toBe(true);
    expect(
      postActionWorkflowRequestSchema.safeParse({
        ...envelope,
        postDraftId: "00000000-0000-4000-8000-000000000005",
        expectedVersionId: "00000000-0000-4000-8000-000000000006",
        component: "hook",
        instruction: "Make the opening more concrete.",
      }).success,
    ).toBe(true);
  });

  it("accepts a complete, content-addressed RSS intake item", () => {
    const result = rssIntakeContractSchema.parse({
      contractVersion: "1.0",
      correlationId: "00000000-0000-4000-8000-000000000001",
      idempotencyKey: "rss:feed-1:item-1",
      feedId: "00000000-0000-4000-8000-000000000002",
      guid: "https://example.test/posts/1",
      canonicalUrl: "https://example.test/posts/1",
      title: "Representative RSS item",
      author: "Editorial team",
      publishedAt: "2026-07-23T11:58:00.000Z",
      summary: "Untrusted RSS source text.",
      contentHash: "a".repeat(64),
      requestedAt: "2026-07-23T12:00:00.000Z",
    });

    expect(result.contentHash).toHaveLength(64);
  });

  it("binds one-off RSS intake to an actor, brand, and idempotency key", () => {
    const request = {
      contractVersion: "1.0",
      correlationId: "00000000-0000-4000-8000-000000000001",
      idempotencyKey: "rss-manual-run-request-0001",
      actorId: "00000000-0000-4000-8000-000000000002",
      brandId: "00000000-0000-4000-8000-000000000003",
      requestedAt: "2026-07-25T10:00:00.000Z",
    };
    expect(rssManualRunRequestSchema.safeParse(request).success).toBe(true);
    expect(rssManualRunRequestSchema.safeParse({ ...request, brandId: "Klaank" }).success).toBe(
      false,
    );
    expect(
      rssManualRunResultSchema.safeParse({
        contractVersion: "1.0",
        generationRunId: "00000000-0000-4000-8000-000000000004",
        duplicate: false,
        status: "accepted",
      }).success,
    ).toBe(true);
  });

  it("accepts Supabase UTC offsets in a persisted RSS feed plan", () => {
    const result = rssFeedPlanSchema.parse({
      contractVersion: "1.0",
      feeds: [
        {
          feedId: "00000000-0000-4000-8000-000000000001",
          feedUrl: "https://example.test/feed.xml",
          name: "Example feed",
          lastPolledAt: "2026-07-25T16:37:20.832+00:00",
          brandLinks: [],
        },
      ],
    });

    expect(result.feeds[0]?.lastPolledAt).toBe("2026-07-25T16:37:20.832+00:00");
  });

  it("binds an automatically selected RSS opportunity to a durable actor", () => {
    const result = rssSourceAnalysisResultSchema.parse({
      contractVersion: "1.0",
      sourceDocumentId: "00000000-0000-4000-8000-000000000001",
      results: [
        {
          actorId: "00000000-0000-4000-8000-000000000002",
          brandId: "00000000-0000-4000-8000-000000000003",
          opportunityId: "00000000-0000-4000-8000-000000000004",
          score: 73,
          riskPenalty: 4,
          duplicate: false,
          researchEligible: true,
          eligibilityReason: "reserved",
        },
      ],
    });

    expect(result.results[0]?.actorId).toBe("00000000-0000-4000-8000-000000000002");
    expect(
      rssSourceAnalysisResultSchema.safeParse({
        ...result,
        results: [{ ...result.results[0], actorId: undefined }],
      }).success,
    ).toBe(false);
  });

  it("validates the plain-text input boundary and its idempotency key", () => {
    const result = manualInputRequestSchema.parse({
      contractVersion: "1.0",
      idempotencyKey: "manual:00000000-0000-4000-8000-000000000001",
      brandId: "00000000-0000-4000-8000-000000000002",
      sourceType: "plain_text",
      title: "Original observation",
      text: "A sufficiently complete internal observation for the content engine.",
      language: "en",
    });

    expect(result.sourceType).toBe("plain_text");
    expect(
      manualInputRequestSchema.safeParse({ ...result, idempotencyKey: "too-short" }).success,
    ).toBe(false);
  });

  it("rejects fake AI output that does not match the final strict draft shape", () => {
    const valid = {
      contractVersion: "1.0",
      contentStyle: "educational_breakdown",
      tone: "thoughtful",
      angles: [
        {
          angleKey: "angle_newsworthy1",
          title: "What changed",
          thesis: "Explain the consequential change while staying inside the available evidence.",
          contentStyle: "newsworthy_authority",
          intendedReaction: "Understand the change.",
          supportingClaimKeys: [],
          score: 80,
          rankExplanation: "A timely route grounded in the available evidence package.",
        },
        {
          angleKey: "angle_educational1",
          title: "Decision framework",
          thesis: "Turn the evidence into a practical framework the audience can reuse.",
          contentStyle: "educational_breakdown",
          intendedReaction: "Apply the framework.",
          supportingClaimKeys: [],
          score: 84,
          rankExplanation: "The strongest route for reusable, evidence-aware learning.",
        },
        {
          angleKey: "angle_perspective1",
          title: "Less obvious shift",
          thesis: "Offer a marked interpretation and invite a useful audience response.",
          contentStyle: "perspective_conversation",
          intendedReaction: "Discuss the interpretation.",
          supportingClaimKeys: [],
          score: 78,
          rankExplanation: "A discussion route that preserves the evidence boundary.",
        },
      ],
      selectedAngleKey: "angle_educational1",
      content: {
        hook: "The useful question is not whether AI works.",
        body: "It is where a team redesigns decisions around it.",
        closing: "Which decision would you redesign first?",
        fullText:
          "The useful question is not whether AI works.\n\nIt is where a team redesigns decisions around it.\n\nWhich decision would you redesign first?",
      },
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
        sentenceClaims: [],
        readyForReview: true,
      },
      revisionCount: 0,
      model: "fake-editorial-v1",
      promptVersion: "facebook-writer.v1",
      responseId: "fake-response-1",
      usage: { inputTokens: 20, outputTokens: 30 },
    };

    expect(fakeDraftOutputSchema.parse(valid).content.body).toContain("decisions");
    expect(fakeDraftOutputSchema.safeParse({ ...valid, usage: {} }).success).toBe(false);
  });

  it("preserves section-aware provenance at the shared source-adapter boundary", () => {
    const result = sourceAdapterResultSchema.parse({
      contractVersion: "1.0",
      outcome: "normalized",
      sourceType: "pdf",
      title: "Operating model report",
      cleanText: "Page-aware extracted source text.",
      contentHash: "b".repeat(64),
      language: "en",
      sections: [
        {
          index: 0,
          label: "Page 1",
          text: "Page-aware extracted source text.",
          pageStart: 1,
          pageEnd: 1,
        },
      ],
      requiresManualReview: false,
      reviewReasons: [],
      provenance: {
        submittedBy: "00000000-0000-4000-8000-000000000001",
        receivedAt: "2026-07-23T12:00:00.000Z",
        originalFilename: "report.pdf",
      },
    });

    expect(result.outcome).toBe("normalized");
    expect(
      sourceAdapterResultSchema.safeParse({
        ...result,
        outcome: "failure",
        code: "unknown_failure",
      }).success,
    ).toBe(false);
  });

  it("validates multi-brand RSS policy and a reservation request", () => {
    const feed = rssFeedUpsertRequestSchema.parse({
      contractVersion: "1.0",
      idempotencyKey: "rss-feed:00000000-0000-4000-8000-000000000001",
      name: "AI operating model reports",
      feedUrl: "https://example.test/feed.xml",
      topicTags: ["AI governance"],
      authorityScore: 82,
      active: true,
      brandRoutes: [
        {
          brandId: "00000000-0000-4000-8000-000000000002",
          generationPolicy: "score_then_research",
          minimumScore: 74,
          dailyGenerationLimit: 3,
          topicTags: ["leadership"],
          includeKeywords: ["accountability"],
          excludeKeywords: ["sponsored"],
        },
      ],
    });
    expect(feed.brandRoutes[0]?.excludeKeywords).toEqual(["sponsored"]);

    const reservation = rssGenerationReservationRequestSchema.parse({
      contractVersion: "1.0",
      correlationId: "00000000-0000-4000-8000-000000000003",
      idempotencyKey: "rss-reserve:00000000-0000-4000-8000-000000000004",
      feedId: "00000000-0000-4000-8000-000000000005",
      brandId: "00000000-0000-4000-8000-000000000002",
      sourceDocumentId: "00000000-0000-4000-8000-000000000006",
      opportunityId: "00000000-0000-4000-8000-000000000007",
      opportunityScore: 79,
      requestedAt: "2026-07-23T12:00:00.000Z",
    });
    expect(reservation.opportunityScore).toBe(79);

    const analysis = rssSourceAnalysisRequestSchema.parse({
      contractVersion: "1.0",
      correlationId: "00000000-0000-4000-8000-000000000003",
      idempotencyKey: "rss-analysis:00000000-0000-4000-8000-000000000006",
      feedId: "00000000-0000-4000-8000-000000000005",
      sourceDocumentId: "00000000-0000-4000-8000-000000000006",
      requestedAt: "2026-07-23T12:00:00.000Z",
    });
    expect(analysis.sourceDocumentId).toBe("00000000-0000-4000-8000-000000000006");
  });

  it("enforces bounded research plans at the shared model boundary", () => {
    const plan = {
      contractVersion: "1.0",
      opportunityId: "00000000-0000-4000-8000-000000000001",
      objective: "Verify the material claims and identify any important contradiction.",
      queries: Array.from({ length: 3 }, (_, index) => ({
        query: `bounded query ${index}`,
        purpose: "Find an authoritative source.",
        priority: "required",
      })),
      preferredSourceTypes: ["primary_document"],
      allowedDomains: [],
      excludedContext: [],
      budget: {
        maxQueries: 3,
        maxDomains: 12,
        maxResults: 20,
        maxElapsedMs: 60_000,
        maxOutputTokens: 5_000,
        maxCostUsd: 1,
      },
    };

    expect(researchPlanSchema.safeParse(plan).success).toBe(true);
    expect(
      researchPlanSchema.safeParse({
        ...plan,
        queries: [...plan.queries, plan.queries[0]!],
      }).success,
    ).toBe(false);
    expect(
      researchPlanSchema.safeParse({
        ...plan,
        budget: { ...plan.budget, maxCostUsd: 0 },
      }).success,
    ).toBe(false);
    expect(
      researchPlanSchema.safeParse({
        ...plan,
        allowedDomains: ["https://example.com/path"],
      }).success,
    ).toBe(false);
  });

  it("rejects evidence packages with broken provenance or unsafe readiness", () => {
    const basePackage = evidencePackageSchema.parse({
      contractVersion: "1.0",
      opportunityId: "00000000-0000-4000-8000-000000000001",
      summary: "The primary source supports the core factual claim with one explicit caveat.",
      sources: [
        {
          sourceKey: "source_primary1",
          url: "https://example.test/report",
          title: "Primary report",
          publisher: "Example Institute",
          publishedAt: "2026-07-22T10:00:00.000Z",
          retrievedAt: "2026-07-23T10:00:00.000Z",
          sourceType: "primary_document",
          authorityScore: 90,
          relevantExcerpt: "The report states the material result.",
        },
      ],
      claims: [
        {
          claimKey: "claim_primary1",
          text: "The report states the material result.",
          claimType: "factual",
          importance: "core",
          riskLevel: "low",
          verificationState: "verified",
          confidence: 0.9,
          evidence: [
            {
              sourceKey: "source_primary1",
              supportType: "supports",
              excerpt: "The report states the material result.",
              locator: "Executive summary",
            },
          ],
          usageGuidance: "safe",
          caveat: null,
        },
      ],
      conflicts: [],
      caveats: ["This reflects the report's own published methodology."],
      readyForWriting: true,
    });

    expect(validateEvidencePackageIntegrity(basePackage)).toEqual({ ok: true, issues: [] });

    const unknownSource = structuredClone(basePackage);
    unknownSource.claims[0]!.evidence[0]!.sourceKey = "source_missing1";
    expect(validateEvidencePackageIntegrity(unknownSource).ok).toBe(false);

    const unsupportedVerified = structuredClone(basePackage);
    unsupportedVerified.claims[0]!.evidence = [];
    expect(validateEvidencePackageIntegrity(unsupportedVerified).ok).toBe(false);

    const unsafeHighRisk = structuredClone(basePackage);
    unsafeHighRisk.claims[0]!.riskLevel = "high";
    unsafeHighRisk.claims[0]!.verificationState = "partially_supported";
    unsafeHighRisk.claims[0]!.usageGuidance = "caveat";
    expect(validateEvidencePackageIntegrity(unsafeHighRisk).ok).toBe(false);

    const unknownConflict = structuredClone(basePackage);
    unknownConflict.conflicts = [
      {
        conflictKey: "conflict_missing1",
        claimKeys: ["claim_unknown1"],
        description: "Two sources describe different outcomes.",
        resolution: "Do not use the disputed number.",
        material: true,
      },
    ];
    expect(validateEvidencePackageIntegrity(unknownConflict).ok).toBe(false);

    const readyWithUnsupportedCore = structuredClone(basePackage);
    readyWithUnsupportedCore.claims[0]!.verificationState = "unsupported";
    readyWithUnsupportedCore.claims[0]!.usageGuidance = "do_not_use";
    expect(validateEvidencePackageIntegrity(readyWithUnsupportedCore).ok).toBe(false);

    const readyWithoutClaims = structuredClone(basePackage);
    readyWithoutClaims.claims = [];
    expect(validateEvidencePackageIntegrity(readyWithoutClaims).ok).toBe(false);

    const nonHttpSource = structuredClone(basePackage);
    nonHttpSource.sources[0]!.url = "ftp://example.test/report";
    expect(() => evidencePackageSchema.parse(nonHttpSource)).toThrow();
  });

  it("binds each recovery target to its exact typed request contract", () => {
    const requestPayload = {
      contractVersion: "1.0",
      correlationId: "00000000-0000-4000-8000-000000000001",
      idempotencyKey: "research-recovery-request-0001",
      actorId: "00000000-0000-4000-8000-000000000002",
      brandId: "00000000-0000-4000-8000-000000000003",
      opportunityId: "00000000-0000-4000-8000-000000000004",
      allowedDomains: [],
      requestedAt: "2026-07-24T10:00:00.000Z",
    };
    const envelope = {
      contractVersion: "1.0",
      workflowExecutionId: "n8n-execution-101",
      workflowName: "WF-05 Research",
      target: "research",
      requestPayload,
    };

    expect(workflowRecoveryExecutionSchema.safeParse(envelope).success).toBe(true);
    expect(
      workflowRecoveryExecutionSchema.safeParse({
        ...envelope,
        target: "post_verification",
      }).success,
    ).toBe(false);
    expect(
      workflowRecoveryExecutionSchema.safeParse({
        ...envelope,
        unexpected: "not accepted",
      }).success,
    ).toBe(false);
  });

  it("rejects raw or unbounded workflow failure details", () => {
    const failure = {
      contractVersion: "1.0",
      workflowExecutionId: "n8n-execution-101",
      retryOfExecutionId: null,
      workflowName: "WF-05 Research",
      errorCode: "provider_timeout",
      category: "provider",
      retryable: true,
      occurredAt: "2026-07-24T10:00:00.000Z",
    };

    expect(workflowRecoveryFailureSchema.safeParse(failure).success).toBe(true);
    expect(
      workflowRecoveryFailureSchema.safeParse({
        ...failure,
        message: "Bearer sk-secret raw provider response",
      }).success,
    ).toBe(false);
    expect(
      workflowRecoveryFailureSchema.safeParse({
        ...failure,
        errorCode: "Provider timeout with spaces",
      }).success,
    ).toBe(false);
  });
});
