export function isRssItemActive(input: {
  firstSeenAt: string;
  resurfacedAt?: string | null;
  resurfaceWindowStart?: string;
  windowStart: string;
}) {
  const windowStart = Date.parse(input.windowStart);
  const resurfaceWindowStart = Date.parse(input.resurfaceWindowStart ?? input.windowStart);
  return (
    Date.parse(input.firstSeenAt) >= windowStart ||
    (input.resurfacedAt ? Date.parse(input.resurfacedAt) >= resurfaceWindowStart : false)
  );
}

export function rssItemActivityTimestamp(input: {
  firstSeenAt: string;
  resurfacedAt?: string | null;
}) {
  return Date.parse(input.resurfacedAt ?? input.firstSeenAt);
}
