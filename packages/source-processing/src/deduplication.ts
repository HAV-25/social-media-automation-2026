import { createHash } from "node:crypto";

export type SimilarityConfig = {
  titleThreshold: number;
  textThreshold: number;
  clusterThreshold: number;
};

export const defaultSimilarityConfig: SimilarityConfig = {
  titleThreshold: 0.82,
  textThreshold: 0.78,
  clusterThreshold: 0.67,
};

const stopWords = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "but",
  "for",
  "from",
  "have",
  "into",
  "not",
  "that",
  "the",
  "their",
  "this",
  "was",
  "were",
  "when",
  "with",
]);

function terms(value: string) {
  return (
    value
      .normalize("NFKC")
      .toLocaleLowerCase("en")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  ).filter((term) => term.length >= 3 && !stopWords.has(term));
}

function features(value: string, shingleSize: number) {
  const tokens = terms(value);
  if (tokens.length < shingleSize) return new Set(tokens);
  return new Set(
    Array.from({ length: tokens.length - shingleSize + 1 }, (_, index) =>
      tokens.slice(index, index + shingleSize).join(" "),
    ),
  );
}

export function jaccardSimilarity(left: string, right: string, shingleSize = 2) {
  const leftFeatures = features(left, shingleSize);
  const rightFeatures = features(right, shingleSize);
  if (!leftFeatures.size && !rightFeatures.size) return 1;
  const intersection = [...leftFeatures].filter((feature) => rightFeatures.has(feature)).length;
  const union = new Set([...leftFeatures, ...rightFeatures]).size;
  return union ? Math.round((intersection / union) * 10_000) / 10_000 : 0;
}

export type ComparableSource = {
  id: string;
  canonicalUrl?: string;
  contentHash: string;
  title: string;
  cleanText: string;
};

export function evaluateDuplicate(
  candidate: ComparableSource,
  existing: ComparableSource,
  config: SimilarityConfig = defaultSimilarityConfig,
) {
  if (candidate.contentHash === existing.contentHash) {
    return { kind: "exact_hash" as const, duplicate: true, titleSimilarity: 1, textSimilarity: 1 };
  }
  if (
    candidate.canonicalUrl &&
    existing.canonicalUrl &&
    candidate.canonicalUrl === existing.canonicalUrl
  ) {
    return { kind: "exact_url" as const, duplicate: true, titleSimilarity: 1, textSimilarity: 1 };
  }
  const titleSimilarity = jaccardSimilarity(candidate.title, existing.title, 1);
  const textSimilarity = jaccardSimilarity(candidate.cleanText, existing.cleanText, 2);
  const duplicate =
    titleSimilarity >= config.titleThreshold && textSimilarity >= config.textThreshold;
  return {
    kind: duplicate ? ("near_duplicate" as const) : ("distinct" as const),
    duplicate,
    titleSimilarity,
    textSimilarity,
  };
}

export function clusterComparableSources(
  sources: ComparableSource[],
  config: SimilarityConfig = defaultSimilarityConfig,
) {
  const sorted = [...sources].sort((left, right) => left.id.localeCompare(right.id));
  const parents = sorted.map((_, index) => index);
  const find = (index: number): number => {
    if (parents[index] !== index) parents[index] = find(parents[index] ?? index);
    return parents[index] ?? index;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot)
      parents[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };

  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      const first = sorted[left];
      const second = sorted[right];
      if (!first || !second) continue;
      const titleSimilarity = jaccardSimilarity(first.title, second.title, 1);
      const textSimilarity = jaccardSimilarity(first.cleanText, second.cleanText, 1);
      const combined = titleSimilarity * 0.4 + textSimilarity * 0.6;
      if (combined >= config.clusterThreshold) union(left, right);
    }
  }

  const groups = new Map<number, ComparableSource[]>();
  sorted.forEach((source, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), source]);
  });
  return [...groups.values()]
    .map((members) => {
      const memberIds = members.map((member) => member.id).sort();
      return {
        clusterKey: createHash("sha256").update(memberIds.join(":")).digest("hex"),
        memberIds,
        representativeId: memberIds[0] ?? "",
      };
    })
    .sort((left, right) => left.clusterKey.localeCompare(right.clusterKey));
}
