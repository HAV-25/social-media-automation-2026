import {
  validateEvidencePackageIntegrity,
  type ResearchProviderResult,
} from "@content-engine/contracts";

export type ResearchEvalThresholds = {
  minimumEvidenceCoverage: number;
  maximumUnsafeUnsupportedClaimRate: number;
  maximumCostUsd: number;
};

export const DEFAULT_RESEARCH_EVAL_THRESHOLDS: ResearchEvalThresholds = {
  minimumEvidenceCoverage: 0.8,
  maximumUnsafeUnsupportedClaimRate: 0,
  maximumCostUsd: 1,
};

export function evaluateResearchResult(
  result: ResearchProviderResult,
  thresholds: ResearchEvalThresholds = DEFAULT_RESEARCH_EVAL_THRESHOLDS,
) {
  const claims = result.evidencePackage.claims;
  const claimsRequiringEvidence = claims.filter((claim) => claim.claimType !== "opinion");
  const evidencedClaims = claimsRequiringEvidence.filter((claim) => claim.evidence.length > 0);
  const evidenceCoverage =
    claimsRequiringEvidence.length === 0
      ? 1
      : evidencedClaims.length / claimsRequiringEvidence.length;
  const unsafeUnsupportedClaims = claimsRequiringEvidence.filter(
    (claim) =>
      ["unsupported", "disputed"].includes(claim.verificationState) &&
      claim.usageGuidance !== "do_not_use",
  );
  const unsafeUnsupportedClaimRate =
    claimsRequiringEvidence.length === 0
      ? 0
      : unsafeUnsupportedClaims.length / claimsRequiringEvidence.length;
  const integrity = validateEvidencePackageIntegrity(result.evidencePackage);
  const costWithinLimit = result.usage.estimatedCostUsd <= thresholds.maximumCostUsd;

  return {
    evidenceCoverage,
    unsafeUnsupportedClaimRate,
    integrityIssues: integrity.issues,
    estimatedCostUsd: result.usage.estimatedCostUsd,
    passed:
      integrity.ok &&
      evidenceCoverage >= thresholds.minimumEvidenceCoverage &&
      unsafeUnsupportedClaimRate <= thresholds.maximumUnsafeUnsupportedClaimRate &&
      costWithinLimit,
  };
}
