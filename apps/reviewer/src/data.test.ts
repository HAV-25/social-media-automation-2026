import { describe, expect, it } from "vitest";
import { brandSchema } from "./data";

describe("reviewer data boundaries", () => {
  it("rejects malformed brand identifiers", () => {
    expect(
      brandSchema.safeParse({ id: "not-a-uuid", name: "Klaank", slug: "klaank" }).success,
    ).toBe(false);
  });
});
