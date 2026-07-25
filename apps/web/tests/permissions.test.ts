import { describe, expect, it } from "vitest";
import { canManageBrand, canManageOrganization, canReviewContent } from "../lib/permissions";

describe("role permissions", () => {
  it("allows administrators and editors to manage brand settings", () => {
    expect(canManageBrand("administrator")).toBe(true);
    expect(canManageBrand("editor")).toBe(true);
    expect(canManageBrand("reviewer")).toBe(false);
    expect(canManageBrand("viewer")).toBe(false);
  });

  it("reserves organization administration for administrators", () => {
    expect(canManageOrganization("administrator")).toBe(true);
    expect(canManageOrganization("editor")).toBe(false);
  });

  it("allows all three working roles to approve or reject", () => {
    expect(canReviewContent("administrator")).toBe(true);
    expect(canReviewContent("editor")).toBe(true);
    expect(canReviewContent("reviewer")).toBe(true);
    expect(canReviewContent("viewer")).toBe(false);
  });
});
