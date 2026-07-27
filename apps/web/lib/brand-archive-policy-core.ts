import { z } from "zod";

export const DEFAULT_BRAND_ARCHIVE_POLICY = {
  inboxWindowHours: 24,
  resurfaceWindowHours: 24,
  archiveMode: "non_destructive",
} as const;

export const brandArchivePolicyInputSchema = z
  .object({
    brandId: z.uuid(),
    inboxWindowHours: z.coerce.number().int().min(6).max(168),
    resurfaceWindowHours: z.coerce.number().int().min(6).max(168),
  })
  .strict();

export const brandArchivePolicySchema = brandArchivePolicyInputSchema
  .omit({ brandId: true })
  .extend({
    archiveMode: z.literal("non_destructive"),
  })
  .strict();

export type BrandArchivePolicy = z.infer<typeof brandArchivePolicySchema>;

export function rollingWindowStart(now: Date, hours: number) {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

export function utcDayStart(now: Date) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}
