import { describe, expect, it } from "vitest";
import {
  brandArchivePolicyInputSchema,
  rollingWindowStart,
  utcDayStart,
} from "./brand-archive-policy-core";

describe("brand archive policy", () => {
  it("accepts bounded rolling windows and rejects destructive or excessive values", () => {
    expect(
      brandArchivePolicyInputSchema.parse({
        brandId: "10000000-0000-4000-8000-000000000001",
        inboxWindowHours: "48",
        resurfaceWindowHours: "12",
      }),
    ).toMatchObject({ inboxWindowHours: 48, resurfaceWindowHours: 12 });
    expect(
      brandArchivePolicyInputSchema.safeParse({
        brandId: "10000000-0000-4000-8000-000000000001",
        inboxWindowHours: 5,
        resurfaceWindowHours: 169,
      }).success,
    ).toBe(false);
  });

  it("keeps the rolling inbox clock separate from the UTC daily-selection clock", () => {
    const now = new Date("2026-07-26T18:30:00.000Z");
    expect(rollingWindowStart(now, 48)).toBe("2026-07-24T18:30:00.000Z");
    expect(utcDayStart(now)).toBe("2026-07-26T00:00:00.000Z");
  });
});
