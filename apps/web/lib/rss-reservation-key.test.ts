import { describe, expect, it } from "vitest";
import { createDailyRssReservationIdentity } from "./rss-reservation-key";

const base = {
  sourceDocumentId: "10000000-0000-4000-8000-000000000001",
  brandId: "20000000-0000-4000-8000-000000000001",
  profileUpdatedAt: "2026-07-26T12:00:00.000Z",
};

describe("daily RSS reservation identity", () => {
  it("is stable throughout one UTC day", () => {
    const morning = createDailyRssReservationIdentity({
      ...base,
      requestedAt: "2026-07-27T00:00:01.000Z",
    });
    const evening = createDailyRssReservationIdentity({
      ...base,
      requestedAt: "2026-07-27T23:59:59.000Z",
    });

    expect(evening).toEqual(morning);
    expect(morning.utcDay).toBe("2026-07-27");
    expect(morning.idempotencyKey).toContain("rss-reserve-v3:2026-07-27:");
  });

  it("reconsiders an unprepared opportunity after the UTC daily reset", () => {
    const previousDay = createDailyRssReservationIdentity({
      ...base,
      requestedAt: "2026-07-26T23:59:59.000Z",
    });
    const nextDay = createDailyRssReservationIdentity({
      ...base,
      requestedAt: "2026-07-27T00:00:00.000Z",
    });

    expect(nextDay.idempotencyKey).not.toBe(previousDay.idempotencyKey);
    expect(nextDay.requestHash).not.toBe(previousDay.requestHash);
  });

  it("reconsiders the opportunity when the brand policy changes", () => {
    const original = createDailyRssReservationIdentity({
      ...base,
      requestedAt: "2026-07-27T10:00:00.000Z",
    });
    const updated = createDailyRssReservationIdentity({
      ...base,
      profileUpdatedAt: "2026-07-27T10:01:00.000Z",
      requestedAt: "2026-07-27T10:02:00.000Z",
    });

    expect(updated.idempotencyKey).not.toBe(original.idempotencyKey);
    expect(updated.requestHash).not.toBe(original.requestHash);
  });
});
