export const RSS_ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isRssItemActive(input: {
  firstSeenAt: string;
  resurfacedAt?: string | null;
  windowStart: string;
}) {
  const windowStart = Date.parse(input.windowStart);
  return (
    Date.parse(input.firstSeenAt) >= windowStart ||
    (input.resurfacedAt ? Date.parse(input.resurfacedAt) >= windowStart : false)
  );
}

export function rssItemActivityTimestamp(input: {
  firstSeenAt: string;
  resurfacedAt?: string | null;
}) {
  return Date.parse(input.resurfacedAt ?? input.firstSeenAt);
}
