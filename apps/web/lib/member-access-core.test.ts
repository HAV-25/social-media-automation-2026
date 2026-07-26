import { describe, expect, it } from "vitest";
import { memberAccessInputSchema } from "./member-access-core";

const assignment = {
  brandId: "20000000-0000-4000-8000-000000000001",
  role: "editor" as const,
};

describe("member access input", () => {
  it("accepts a bounded role and unique brand assignment contract", () => {
    expect(
      memberAccessInputSchema.parse({
        organizationId: "10000000-0000-4000-8000-000000000001",
        userId: "40000000-0000-4000-8000-000000000001",
        organizationRole: "reviewer",
        brandAssignments: [assignment],
      }).brandAssignments,
    ).toEqual([assignment]);
  });

  it("rejects duplicate brands, unknown roles and oversized assignment lists", () => {
    const base = {
      organizationId: "10000000-0000-4000-8000-000000000001",
      userId: "40000000-0000-4000-8000-000000000001",
      organizationRole: "reviewer",
    };
    expect(() =>
      memberAccessInputSchema.parse({ ...base, brandAssignments: [assignment, assignment] }),
    ).toThrow();
    expect(() =>
      memberAccessInputSchema.parse({ ...base, organizationRole: "owner", brandAssignments: [] }),
    ).toThrow();
    expect(() =>
      memberAccessInputSchema.parse({
        ...base,
        brandAssignments: Array.from({ length: 21 }, (_, index) => ({
          brandId: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          role: "viewer",
        })),
      }),
    ).toThrow();
  });
});
