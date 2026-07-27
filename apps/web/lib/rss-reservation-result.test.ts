import { describe, expect, it } from "vitest";
import { resolveRssReservationResult } from "./rss-reservation-result";

describe("RSS reservation result", () => {
  it("does not dispatch downstream work for an idempotent reservation replay", () => {
    expect(
      resolveRssReservationResult({
        eligible: true,
        reason: "reserved",
        duplicate: true,
      }),
    ).toEqual({
      researchEligible: false,
      eligibilityReason: "already_prepared",
    });
  });

  it("dispatches a newly reserved opportunity exactly once", () => {
    expect(
      resolveRssReservationResult({
        eligible: true,
        reason: "reserved",
        duplicate: false,
      }),
    ).toEqual({
      researchEligible: true,
      eligibilityReason: "reserved",
    });
  });
});
