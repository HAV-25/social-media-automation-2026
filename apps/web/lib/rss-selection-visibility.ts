export type RssSelectionVisibility =
  | "selected"
  | "below_threshold"
  | "daily_limit"
  | "ingest_only"
  | "awaiting_selection";

export function deriveRssSelectionVisibility(input: {
  selected: boolean;
  automaticSelection: boolean;
  generationPolicy: string | null;
  score: number;
  minimumScore: number;
  selectedToday: number;
  dailyLimit: number;
}): RssSelectionVisibility {
  if (input.selected) return "selected";
  if (!input.automaticSelection || input.generationPolicy === "ingest_only") {
    return "ingest_only";
  }
  if (input.score < input.minimumScore) return "below_threshold";
  if (input.selectedToday >= input.dailyLimit) return "daily_limit";
  return "awaiting_selection";
}
