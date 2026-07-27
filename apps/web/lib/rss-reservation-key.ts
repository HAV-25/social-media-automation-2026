import { sha256Hex } from "@content-engine/security";
import { z } from "zod";

const inputSchema = z.object({
  sourceDocumentId: z.uuid(),
  brandId: z.uuid(),
  profileUpdatedAt: z.iso.datetime({ offset: true }),
  requestedAt: z.iso.datetime({ offset: true }),
});

export function createDailyRssReservationIdentity(input: z.input<typeof inputSchema>) {
  const parsed = inputSchema.parse(input);
  const utcDay = new Date(parsed.requestedAt).toISOString().slice(0, 10);
  const policyVersion = sha256Hex(parsed.profileUpdatedAt).slice(0, 16);

  return {
    idempotencyKey: `rss-reserve-v3:${utcDay}:${parsed.sourceDocumentId}:${parsed.brandId}:${policyVersion}`,
    requestHash: sha256Hex(
      [utcDay, parsed.sourceDocumentId, parsed.brandId, parsed.profileUpdatedAt].join(":"),
    ),
    utcDay,
  };
}
