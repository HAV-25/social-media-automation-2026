export type RssSelectionVisibility =
  | "selected"
  | "review"
  | "stored_only"
  | "below_threshold"
  | "daily_limit"
  | "ingest_only"
  | "awaiting_selection";

export const RSS_REVIEW_MINIMUM_SCORE = 60;
export const RSS_AUTOMATIC_MINIMUM_SCORE = 75;

export function countDistinctDailyReservations(
  reservations: Array<{ entityId: string; createdAt: string }>,
  dailyStart: string,
) {
  const dailyStartMs = Date.parse(dailyStart);
  if (!Number.isFinite(dailyStartMs)) throw new Error("Daily reservation start is invalid.");
  return new Set(
    reservations
      .filter(({ createdAt }) => Date.parse(createdAt) >= dailyStartMs)
      .map(({ entityId }) => entityId),
  ).size;
}

export function deriveRssSelectionVisibility(input: {
  selected: boolean;
  automaticPreparationAllowed: boolean;
  automaticSelection: boolean;
  generationPolicy: string | null;
  score: number;
  minimumScore: number;
  selectedToday: number;
  dailyLimit: number;
}): RssSelectionVisibility {
  if (!input.automaticSelection || input.generationPolicy === "ingest_only") {
    return "ingest_only";
  }
  if (input.score < RSS_REVIEW_MINIMUM_SCORE) return "stored_only";
  if (!input.automaticPreparationAllowed || input.score < input.minimumScore) return "review";
  if (input.selected) return "selected";
  if (input.selectedToday >= input.dailyLimit) return "daily_limit";
  return "awaiting_selection";
}
