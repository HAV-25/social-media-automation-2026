import { describe, expect, it } from "vitest";
import { buildReviewerPackage, createStoredZip, sanitizePackageStem } from "./download-package";

function storedEntries(zip: Buffer) {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 4 <= zip.byteLength && zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = zip.subarray(nameStart, nameStart + nameLength).toString("utf8");
    entries.set(name, zip.subarray(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  return entries;
}

describe("reviewer download package", () => {
  it("creates a deterministic stored ZIP with the four reviewer-safe files", () => {
    const result = buildReviewerPackage({
      post: {
        id: "66000000-0000-4000-8000-000000000001",
        brandId: "20000000-0000-4000-8000-000000000001",
        opportunityId: "65000000-0000-4000-8000-000000000001",
        sourceTitle: "../../AI operating model: a field note",
        contentStyle: "educational_breakdown",
        tone: "thoughtful",
        status: "ready_for_review",
        versionId: "67000000-0000-4000-8000-000000000001",
        versionNumber: 2,
        fullText: "A verified post.\n\nEvidence-led body.\n\nWhat would you test?",
        evaluation: null,
      },
      image: {
        bytes: Buffer.from("fake-png-bytes"),
        state: {
          status: "ready",
          imageAssetId: "68000000-0000-4000-8000-000000000001",
          postVersionId: "67000000-0000-4000-8000-000000000001",
          direction: {
            contractVersion: "1.0",
            selectedConceptKey: "concept_abcdef",
            concepts: [],
          } as never,
          selectedConceptKey: "concept_abcdef",
          template: "insight_split",
          validation: null,
          model: "fake-image-v1",
          promptVersion: "image-director.v1",
          providerResponseId: "fake-response",
          estimatedCostUsd: 0,
          createdAt: "2026-07-24T12:00:00.000Z",
          baseImagePath: null,
          finalImagePath: null,
        },
      },
    });
    const entries = storedEntries(result.bytes);
    expect([...entries.keys()]).toEqual([
      "post.txt",
      "final-image.png",
      "source-evidence-summary.md",
      "generation-metadata.json",
    ]);
    expect(entries.get("post.txt")?.toString("utf8")).toContain("A verified post.");
    expect(entries.get("final-image.png")?.toString("utf8")).toBe("fake-png-bytes");
    expect(entries.get("source-evidence-summary.md")?.toString("utf8")).toContain(
      "Source and evidence summary",
    );
    expect(entries.get("generation-metadata.json")?.toString("utf8")).not.toContain(
      "OPENAI_API_KEY",
    );
    expect(result.filename).toBe("ai-operating-model-a-field-note-package.zip");
  });

  it("rejects unsafe and duplicate ZIP entry names", () => {
    expect(() => createStoredZip([{ name: "../secret.txt", bytes: Buffer.from("no") }])).toThrow(
      /unsafe/,
    );
    expect(() =>
      createStoredZip([
        { name: "post.txt", bytes: Buffer.from("one") },
        { name: "post.txt", bytes: Buffer.from("two") },
      ]),
    ).toThrow(/unique/);
    expect(sanitizePackageStem("   ")).toBe("facebook-post");
  });
});
