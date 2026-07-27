import { contentStyleSchema, toneSchema } from "@content-engine/contracts";
import { z } from "zod";

export const readyPostStatusSchema = z.enum(["ready_for_review", "changes_requested"]);
export type ReadyPostStatus = z.infer<typeof readyPostStatusSchema>;
const readyPostDateWindowSchema = z.enum(["all", "24h", "7d", "30d"]);
const readyPostSortSchema = z.enum(["updated_desc", "updated_asc", "quality_desc", "quality_asc"]);

export const readyPostFiltersSchema = z.object({
  window: readyPostDateWindowSchema.catch("all").default("all"),
  status: z
    .union([z.literal("all"), readyPostStatusSchema])
    .catch("all")
    .default("all"),
  style: z
    .union([z.literal("all"), contentStyleSchema])
    .catch("all")
    .default("all"),
  tone: z
    .union([z.literal("all"), toneSchema])
    .catch("all")
    .default("all"),
  sort: readyPostSortSchema.catch("updated_desc").default("updated_desc"),
});
export type ReadyPostFilters = z.infer<typeof readyPostFiltersSchema>;

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseReadyPostFilters(
  query: Record<string, string | string[] | undefined>,
): ReadyPostFilters {
  return readyPostFiltersSchema.parse({
    window: firstQueryValue(query.window),
    status: firstQueryValue(query.status),
    style: firstQueryValue(query.style),
    tone: firstQueryValue(query.tone),
    sort: firstQueryValue(query.sort),
  });
}

export function readyPostWindowStart(window: ReadyPostFilters["window"], now = new Date()) {
  const hours = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 } as const;
  if (window === "all") return null;
  return new Date(now.getTime() - hours[window] * 60 * 60 * 1_000);
}
