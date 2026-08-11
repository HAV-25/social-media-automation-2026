import { describe, expect, it } from "vitest";
import { brandSchema, manifestContainsDraftVersion } from "./data";

describe("reviewer data boundaries", () => {
  it("rejects malformed brand identifiers", () => {
    expect(
      brandSchema.safeParse({ id: "not-a-uuid", name: "Klaank", slug: "klaank" }).success,
    ).toBe(false);
  });

  it("binds a durable package to the exact draft version", () => {
    const manifest = {
      posts: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          current_version_id: "40000000-0000-4000-8000-000000000001",
        },
      ],
    };
    expect(
      manifestContainsDraftVersion(
        manifest,
        "30000000-0000-4000-8000-000000000001",
        "40000000-0000-4000-8000-000000000001",
      ),
    ).toBe(true);
    expect(
      manifestContainsDraftVersion(
        manifest,
        "30000000-0000-4000-8000-000000000001",
        "40000000-0000-4000-8000-000000000002",
      ),
    ).toBe(false);
  });
});
