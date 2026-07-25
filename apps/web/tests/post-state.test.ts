import { describe, expect, it } from "vitest";
import { assertCurrentVersion, nextPostStatus } from "../lib/post-state";

describe("post state transitions", () => {
  it("allows review actions only from defined states", () => {
    expect(nextPostStatus("ready_for_review", "approve")).toBe("approved");
    expect(nextPostStatus("ready_for_review", "request_changes")).toBe("changes_requested");
    expect(nextPostStatus("changes_requested", "edit")).toBe("ready_for_review");
    expect(nextPostStatus("changes_requested", "approve")).toBeNull();
  });

  it("keeps approved and rejected posts terminal", () => {
    expect(nextPostStatus("approved", "edit")).toBeNull();
    expect(nextPostStatus("rejected", "approve")).toBeNull();
  });

  it("rejects stale version mutations", () => {
    expect(() => assertCurrentVersion("version-2", "version-1")).toThrow("Post version is stale.");
    expect(() => assertCurrentVersion("version-2", "version-2")).not.toThrow();
  });
});
