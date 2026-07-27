export type RssReservationResult = {
  eligible: boolean;
  reason:
    | "reserved"
    | "already_prepared"
    | "ingest_only"
    | "below_threshold"
    | "daily_limit"
    | "inactive";
  duplicate: boolean;
};

export function resolveRssReservationResult(reservation: RssReservationResult) {
  if (reservation.duplicate) {
    return {
      researchEligible: false,
      eligibilityReason: "already_prepared" as const,
    };
  }

  return {
    researchEligible: reservation.eligible,
    eligibilityReason: reservation.reason,
  };
}
