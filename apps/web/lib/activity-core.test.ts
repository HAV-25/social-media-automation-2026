import { describe, expect, it } from "vitest";
import {
  activityEntityHref,
  activityFilterSchema,
  activityKind,
  activityLabel,
  activityReason,
  activityWindowStart,
} from "./activity-core";

describe("activity history", () => {
  it("accepts only bounded filters", () => {
    expect(activityFilterSchema.parse({}).window).toBe("7d");
    expect(() => activityFilterSchema.parse({ search: "x".repeat(101) })).toThrow();
    expect(() => activityFilterSchema.parse({ view: "secrets" })).toThrow();
  });

  it("separates feedback, human and workflow activity", () => {
    expect(activityKind("post.reject", "10000000-0000-4000-8000-000000000001")).toBe("feedback");
    expect(activityKind("brand.asset.uploaded", "10000000-0000-4000-8000-000000000001")).toBe(
      "human",
    );
    expect(activityKind("post.draft.created", null)).toBe("system");
  });

  it("renders controlled labels, reasons and entity links", () => {
    expect(activityLabel("post.approve")).toBe("Post approved");
    expect(activityLabel("brand.asset.uploaded")).toBe("Brand asset uploaded");
    expect(activityReason({ reason: " Needs evidence. " })).toBe("Needs evidence.");
    expect(activityReason({ reason: 42 })).toBeNull();
    expect(activityEntityHref("post_draft", "10000000-0000-4000-8000-000000000001")).toBe(
      "/posts/10000000-0000-4000-8000-000000000001",
    );
    expect(
      activityEntityHref("source_document", "10000000-0000-4000-8000-000000000001"),
    ).toBeNull();
  });

  it("uses deterministic rolling windows", () => {
    const now = new Date("2026-07-26T12:00:00.000Z");
    expect(activityWindowStart("24h", now)).toBe("2026-07-25T12:00:00.000Z");
    expect(activityWindowStart("7d", now)).toBe("2026-07-19T12:00:00.000Z");
    expect(activityWindowStart("all", now)).toBeNull();
  });
});
