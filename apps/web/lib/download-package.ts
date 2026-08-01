import type { DraftEvaluation, EvidencePackage } from "@content-engine/contracts";
import type { PostImageReviewState } from "./post-image-review";

export type ZipEntry = {
  name: string;
  bytes: Buffer;
};

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function safeEntryName(value: string) {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.includes("../") ||
    normalized.includes("\0") ||
    normalized.length > 180
  ) {
    throw new Error("ZIP entry filename is unsafe.");
  }
  return normalized;
}

export function createStoredZip(entries: ZipEntry[]) {
  if (!entries.length || entries.length > 20) throw new Error("ZIP entry count is invalid.");
  const names = new Set<string>();
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  let totalBytes = 0;

  for (const rawEntry of entries) {
    const name = safeEntryName(rawEntry.name);
    if (names.has(name)) throw new Error("ZIP entry filenames must be unique.");
    names.add(name);
    if (rawEntry.bytes.byteLength > 25 * 1024 * 1024) {
      throw new Error("ZIP entry exceeds the package size limit.");
    }
    totalBytes += rawEntry.bytes.byteLength;
    if (totalBytes > 40 * 1024 * 1024) throw new Error("ZIP package exceeds the size limit.");

    const nameBytes = Buffer.from(name, "utf8");
    const checksum = crc32(rawEntry.bytes);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x0021, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(rawEntry.bytes.byteLength, 18);
    localHeader.writeUInt32LE(rawEntry.bytes.byteLength, 22);
    localHeader.writeUInt16LE(nameBytes.byteLength, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBytes, rawEntry.bytes);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x0021, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(rawEntry.bytes.byteLength, 20);
    centralHeader.writeUInt32LE(rawEntry.bytes.byteLength, 24);
    centralHeader.writeUInt16LE(nameBytes.byteLength, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.byteLength + nameBytes.byteLength + rawEntry.bytes.byteLength;
  }

  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.byteLength, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, central, end]);
}

export function sanitizePackageStem(value: string) {
  const safe = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 80)
    .toLowerCase();
  return safe || "facebook-post";
}

function evidenceSummary(input: {
  sourceTitle: string;
  opportunityId: string;
  evaluation: DraftEvaluation | null;
  evidencePackage: EvidencePackage | null;
}) {
  const claims =
    input.evaluation?.sentenceClaims
      .map(
        (mapping, index) =>
          `${index + 1}. [${mapping.state}] ${mapping.sentence}\n   Claims: ${
            mapping.claimKeys.join(", ") || "No factual claim required"
          }`,
      )
      .join("\n") ?? "No sentence-level claim mappings were recorded.";
  const warnings = input.evaluation?.warnings.length
    ? input.evaluation.warnings.map((warning) => `- ${warning}`).join("\n")
    : "- None";
  const researchSources = input.evidencePackage?.sources.length
    ? input.evidencePackage.sources
        .map(
          (source, index) =>
            `${index + 1}. ${source.title} — ${source.publisher}\n   ${source.url}\n   Retrieved: ${source.retrievedAt}`,
        )
        .join("\n")
    : "No research sources were recorded.";
  const researchClaims = input.evidencePackage?.claims.length
    ? input.evidencePackage.claims
        .map(
          (claim, index) =>
            `${index + 1}. [${claim.verificationState}; ${claim.usageGuidance}; risk ${claim.riskLevel}] ${claim.text}${claim.caveat ? `\n   Caveat: ${claim.caveat}` : ""}`,
        )
        .join("\n")
    : "No research claims were recorded.";
  const researchWarnings = [
    ...(input.evidencePackage?.caveats ?? []),
    ...(input.evidencePackage?.conflicts.map(
      (conflict) => `${conflict.description} Resolution: ${conflict.resolution}`,
    ) ?? []),
  ];
  return `# Source and evidence summary

Source: ${input.sourceTitle}
Opportunity ID: ${input.opportunityId}

## Sentence-to-claim review

${claims}

## Research sources

${researchSources}

## Claims ledger

${researchClaims}

## Quality and risk warnings

${warnings}

## Research caveats and conflicts

${researchWarnings.length ? researchWarnings.map((warning) => `- ${warning}`).join("\n") : "- None"}
`;
}

export function buildReviewerPackage(input: {
  post: {
    id: string;
    brandId: string;
    opportunityId: string;
    sourceTitle: string;
    contentStyle: string;
    tone: string;
    status: string;
    versionId: string;
    versionNumber: number;
    fullText: string;
    evaluation: DraftEvaluation | null;
    provenance: {
      model: string | null;
      promptVersion: string | null;
      responseId: string | null;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      promptSnapshot: {
        promptVersion: string;
        systemPrompt: string;
        userPrompt: string;
        checksum: string;
      } | null;
    };
  };
  research: {
    evidencePackage: EvidencePackage;
    model: string;
    promptVersion: string;
    responseId: string;
    usage: {
      inputTokens: number;
      outputTokens: number;
      webSearchCalls: number;
      estimatedCostUsd: number;
    };
  } | null;
  decision: {
    type: string;
    reason: string;
    reviewerId: string | null;
    decidedAt: string;
    warningsAcknowledged: boolean;
    warningSnapshot: unknown;
  } | null;
  image: { bytes: Buffer; state: PostImageReviewState };
}) {
  const researchCostUsd = input.research?.usage.estimatedCostUsd ?? 0;
  const postCostUsd = input.post.provenance.costUsd;
  const imageCostUsd = input.image.state.estimatedCostUsd;
  const metadata = {
    contractVersion: "1.0",
    exportedAt: new Date().toISOString(),
    post: {
      id: input.post.id,
      versionId: input.post.versionId,
      versionNumber: input.post.versionNumber,
      brandId: input.post.brandId,
      opportunityId: input.post.opportunityId,
      contentStyle: input.post.contentStyle,
      tone: input.post.tone,
      status: input.post.status,
      scores: input.post.evaluation,
      prompt: input.post.provenance.promptSnapshot,
      model: input.post.provenance.model,
      promptVersion: input.post.provenance.promptVersion,
      responseId: input.post.provenance.responseId,
    },
    research: input.research,
    image: {
      imageAssetId: input.image.state.imageAssetId,
      selectedConceptKey: input.image.state.selectedConceptKey,
      template: input.image.state.template,
      model: input.image.state.model,
      promptVersion: input.image.state.promptVersion,
      providerResponseId: input.image.state.providerResponseId,
      prompt: input.image.state.prompt,
      estimatedCostUsd: input.image.state.estimatedCostUsd,
      validation: input.image.state.validation,
      createdAt: input.image.state.createdAt,
    },
    decision: input.decision,
    cost: {
      researchUsd: researchCostUsd,
      postUsd: postCostUsd,
      imageUsd: imageCostUsd,
      totalUsd: researchCostUsd + postCostUsd + imageCostUsd,
    },
  };
  const zip = createStoredZip([
    { name: "post.txt", bytes: Buffer.from(input.post.fullText, "utf8") },
    { name: "final-image.png", bytes: input.image.bytes },
    {
      name: "source-evidence-summary.md",
      bytes: Buffer.from(
        evidenceSummary({
          sourceTitle: input.post.sourceTitle,
          opportunityId: input.post.opportunityId,
          evaluation: input.post.evaluation,
          evidencePackage: input.research?.evidencePackage ?? null,
        }),
        "utf8",
      ),
    },
    {
      name: "generation-metadata.json",
      bytes: Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, "utf8"),
    },
  ]);
  return {
    bytes: zip,
    filename: `${sanitizePackageStem(input.post.sourceTitle)}-package.zip`,
  };
}
