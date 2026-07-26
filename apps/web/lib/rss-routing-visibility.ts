export function explainRssRouteFilter(input: {
  title: string;
  rawText: string | null;
  includeKeywords: string[];
  excludeKeywords: string[];
}) {
  const haystack = [input.title, input.rawText].filter(Boolean).join(" ").toLocaleLowerCase();
  const excluded = input.excludeKeywords.find((keyword) =>
    haystack.includes(keyword.toLocaleLowerCase()),
  );
  if (excluded) return `Filtered by excluded keyword “${excluded}”`;
  const included = input.includeKeywords.some((keyword) =>
    haystack.includes(keyword.toLocaleLowerCase()),
  );
  if (input.includeKeywords.length && !included) {
    return "Filtered because it did not match this brand’s include keywords";
  }
  return "Filtered by the brand route";
}
