import { compareParsedVersions, versionDistance } from "./parser";
import type { FileEntry, MatchResultItem, VersionCompareConfig } from "./types";

interface Bucket {
  bucketKey: string;
  matchKey: string;
  displayKey: string;
  left: FileEntry[];
  right: FileEntry[];
}

interface PairScore {
  left: FileEntry;
  right: FileEntry;
  score: number;
  versionDistance: number;
  dateDistance: number;
  nameDistance: number;
  reason: string;
}

export interface MatchBuildResult {
  items: MatchResultItem[];
  diagnostics: string[];
}

export function buildMatchResults(
  leftFiles: FileEntry[],
  rightFiles: FileEntry[],
  config: VersionCompareConfig,
): MatchBuildResult {
  const diagnostics: string[] = [];
  const items: MatchResultItem[] = [];
  const manualApplied = applyGlobalManualMatches(leftFiles, rightFiles, config, items, diagnostics);
  const buckets = buildBuckets(manualApplied.leftFiles, manualApplied.rightFiles, config);

  for (const bucket of [...buckets.values()].sort((a, b) => a.bucketKey.localeCompare(b.bucketKey))) {
    diagnostics.push(
      `matchKey=${bucket.bucketKey} leftCandidates=${bucket.left.length} rightCandidates=${bucket.right.length}`,
    );

    if (bucket.left.length === 0) {
      for (const right of bucket.right) {
        items.push(rightOnlyItem(bucket, right));
      }
      continue;
    }

    if (bucket.right.length === 0) {
      for (const left of bucket.left) {
        items.push(leftOnlyItem(bucket, left));
      }
      continue;
    }

    const manualApplied = applyManualMatches(bucket, config, items);
    const remainingLeft = bucket.left.filter((entry) => !manualApplied.left.has(entry.relativePath));
    const remainingRight = bucket.right.filter((entry) => !manualApplied.right.has(entry.relativePath));

    if (remainingLeft.length === 0) {
      for (const right of remainingRight) {
        items.push(rightOnlyItem(bucket, right));
      }
      continue;
    }

    if (remainingRight.length === 0) {
      for (const left of remainingLeft) {
        items.push(leftOnlyItem(bucket, left));
      }
      continue;
    }

    if (remainingLeft.length === 1 && remainingRight.length === 1) {
      items.push(pairItem(bucket, remainingLeft[0], remainingRight[0], "single candidate on each side"));
      continue;
    }

    const strategy = config.disambiguation.strategy === "manualPreferred"
      ? "minDistanceGreedy"
      : config.disambiguation.strategy;

    if (hasUnparsedVersionInMultiCandidate(remainingLeft, remainingRight)) {
      const reason = "ambiguous: version parsing failed while multiple candidates exist";
      diagnostics.push(`${bucket.bucketKey}: ${reason}`);
      items.push(ambiguousItem(bucket, remainingLeft, remainingRight, reason));
      continue;
    }

    if (strategy === "latestOnEachSide") {
      disambiguateLatest(bucket, remainingLeft, remainingRight, config, items, diagnostics);
    } else {
      disambiguateGreedy(bucket, remainingLeft, remainingRight, config, items, diagnostics);
    }
  }

  return {
    items,
    diagnostics,
  };
}

function applyGlobalManualMatches(
  leftFiles: FileEntry[],
  rightFiles: FileEntry[],
  config: VersionCompareConfig,
  items: MatchResultItem[],
  diagnostics: string[],
): { leftFiles: FileEntry[]; rightFiles: FileEntry[] } {
  const leftByPath = new Map(leftFiles.map((entry) => [entry.relativePath, entry]));
  const rightByPath = new Map(rightFiles.map((entry) => [entry.relativePath, entry]));
  const usedLeft = new Set<string>();
  const usedRight = new Set<string>();

  for (const [key, manual] of Object.entries(config.manualMatches)) {
    const left = leftByPath.get(manual.leftRelPath);
    const right = rightByPath.get(manual.rightRelPath);
    if (!left || !right || usedLeft.has(left.relativePath) || usedRight.has(right.relativePath)) {
      continue;
    }

    const bucket = manualBucket(left, right, config);
    items.push(pairItem(bucket, left, right, `manual force match (${key})`));
    diagnostics.push(
      `manualMatch=${key} left=${left.relativePath} right=${right.relativePath} leftKey=${makeKeys(left, config).bucketKey} rightKey=${makeKeys(right, config).bucketKey}`,
    );
    usedLeft.add(left.relativePath);
    usedRight.add(right.relativePath);
  }

  return {
    leftFiles: leftFiles.filter((entry) => !usedLeft.has(entry.relativePath)),
    rightFiles: rightFiles.filter((entry) => !usedRight.has(entry.relativePath)),
  };
}

export function makeKeys(entry: FileEntry, config: VersionCompareConfig): {
  bucketKey: string;
  matchKey: string;
  displayKey: string;
} {
  const typePrefix = config.matching.includeTypePrefix && entry.parsed.typePrefixNormalized
    ? `${entry.parsed.typePrefixNormalized}_`
    : "";
  const extensionPart = entry.ext ? `.${entry.ext}` : ".";
  const matchKey = `${typePrefix}${entry.parsed.coreKey}${extensionPart}`;
  const bucketKey = config.matching.scope === "sameFolder"
    ? `${entry.dirRelative || "."}/${matchKey}`
    : matchKey;

  return {
    bucketKey,
    matchKey,
    displayKey: matchKey,
  };
}

function buildBuckets(
  leftFiles: FileEntry[],
  rightFiles: FileEntry[],
  config: VersionCompareConfig,
): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>();
  for (const file of leftFiles) {
    addToBucket(file, "left", buckets, config);
  }
  for (const file of rightFiles) {
    addToBucket(file, "right", buckets, config);
  }
  return buckets;
}

function addToBucket(
  file: FileEntry,
  side: "left" | "right",
  buckets: Map<string, Bucket>,
  config: VersionCompareConfig,
): void {
  const keys = makeKeys(file, config);
  if (isIgnored(keys.bucketKey, keys.matchKey, config.ignoreKeys)) {
    return;
  }

  const bucket = buckets.get(keys.bucketKey) ?? {
    bucketKey: keys.bucketKey,
    matchKey: keys.matchKey,
    displayKey: keys.displayKey,
    left: [],
    right: [],
  };
  bucket[side].push(file);
  buckets.set(keys.bucketKey, bucket);
}

function isIgnored(bucketKey: string, matchKey: string, ignoreKeys: string[]): boolean {
  return ignoreKeys.some((ignored) => ignored === bucketKey || ignored === matchKey);
}

function applyManualMatches(
  bucket: Bucket,
  config: VersionCompareConfig,
  items: MatchResultItem[],
): { left: Set<string>; right: Set<string> } {
  const usedLeft = new Set<string>();
  const usedRight = new Set<string>();
  const leftByPath = new Map(bucket.left.map((entry) => [entry.relativePath, entry]));
  const rightByPath = new Map(bucket.right.map((entry) => [entry.relativePath, entry]));

  for (const [key, manual] of Object.entries(config.manualMatches)) {
    const appliesToBucket = key === bucket.bucketKey || key.startsWith(`${bucket.bucketKey}::`);
    if (!appliesToBucket) {
      continue;
    }

    const left = leftByPath.get(manual.leftRelPath);
    const right = rightByPath.get(manual.rightRelPath);
    if (!left || !right || usedLeft.has(left.relativePath) || usedRight.has(right.relativePath)) {
      continue;
    }

    items.push(pairItem(bucket, left, right, `manual override (${key})`));
    usedLeft.add(left.relativePath);
    usedRight.add(right.relativePath);
  }

  return { left: usedLeft, right: usedRight };
}

function disambiguateLatest(
  bucket: Bucket,
  left: FileEntry[],
  right: FileEntry[],
  config: VersionCompareConfig,
  items: MatchResultItem[],
  diagnostics: string[],
): void {
  const latestLeft = pickUniqueLatest(left);
  const latestRight = pickUniqueLatest(right);

  if (!latestLeft || !latestRight) {
    const reason = "ambiguous: latestOnEachSide could not identify a unique latest candidate";
    diagnostics.push(`${bucket.bucketKey}: ${reason}`);
    items.push(ambiguousItem(bucket, left, right, reason));
    return;
  }

  const score = scorePair(latestLeft, latestRight, config);
  if (isMajorMismatch(score.left, score.right, config)) {
    const reason = "ambiguous: latest candidates have different major versions";
    diagnostics.push(`${bucket.bucketKey}: ${reason}`);
    items.push(ambiguousItem(bucket, left, right, reason));
    return;
  }

  items.push(pairItem(bucket, latestLeft, latestRight, `latestOnEachSide; ${score.reason}`));
  for (const leftoverLeft of left.filter((entry) => entry !== latestLeft)) {
    items.push(leftOnlyItem(bucket, leftoverLeft));
  }
  for (const leftoverRight of right.filter((entry) => entry !== latestRight)) {
    items.push(rightOnlyItem(bucket, leftoverRight));
  }
}

function disambiguateGreedy(
  bucket: Bucket,
  left: FileEntry[],
  right: FileEntry[],
  config: VersionCompareConfig,
  items: MatchResultItem[],
  diagnostics: string[],
): void {
  const remainingLeft = new Set(left);
  const remainingRight = new Set(right);

  while (remainingLeft.size > 0 && remainingRight.size > 0) {
    const scores = buildScores([...remainingLeft], [...remainingRight], config);
    if (scores.length === 0) {
      break;
    }

    const best = scores[0];
    if (isMajorMismatch(best.left, best.right, config)) {
      const reason = "ambiguous: best pair has different major versions";
      diagnostics.push(`${bucket.bucketKey}: ${reason}`);
      items.push(ambiguousItem(bucket, [...remainingLeft], [...remainingRight], reason));
      return;
    }

    const competing = scores.find((candidate) => {
      return candidate !== best && (candidate.left === best.left || candidate.right === best.right);
    });

    if (competing && competing.score - best.score < config.disambiguation.ambiguityDeltaThreshold) {
      const reason =
        `ambiguous: best score ${best.score} is too close to competing score ${competing.score}; ` +
        `threshold=${config.disambiguation.ambiguityDeltaThreshold}`;
      diagnostics.push(`${bucket.bucketKey}: ${reason}`);
      items.push(ambiguousItem(bucket, [...remainingLeft], [...remainingRight], reason));
      return;
    }

    items.push(pairItem(bucket, best.left, best.right, best.reason));
    remainingLeft.delete(best.left);
    remainingRight.delete(best.right);
  }

  for (const entry of remainingLeft) {
    items.push(leftOnlyItem(bucket, entry));
  }
  for (const entry of remainingRight) {
    items.push(rightOnlyItem(bucket, entry));
  }
}

function buildScores(left: FileEntry[], right: FileEntry[], config: VersionCompareConfig): PairScore[] {
  const scores: PairScore[] = [];
  for (const leftEntry of left) {
    for (const rightEntry of right) {
      scores.push(scorePair(leftEntry, rightEntry, config));
    }
  }
  return scores.sort((a, b) => a.score - b.score || a.left.relativePath.localeCompare(b.left.relativePath));
}

function scorePair(left: FileEntry, right: FileEntry, config: VersionCompareConfig): PairScore {
  const vDistance = versionDistance(left.parsed.versionParsed, right.parsed.versionParsed);
  const dDistance = dateDistance(left, right);
  const nDistance = normalizedNameDistance(left.parsed.coreKey, right.parsed.coreKey);
  const score = vDistance * 100 + dDistance * 0.01 + nDistance;
  const crossedType = isCrossType(left, right);
  const reason = [
    `matchKey=${makeKeys(left, config).bucketKey}`,
    `versionDistance=${vDistance}`,
    `dateDistance=${dDistance}`,
    `nameDistance=${nDistance.toFixed(3)}`,
    crossedType ? "crossType=true" : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    left,
    right,
    score,
    versionDistance: vDistance,
    dateDistance: dDistance,
    nameDistance: nDistance,
    reason,
  };
}

function pickUniqueLatest(entries: FileEntry[]): FileEntry | undefined {
  const sorted = [...entries].sort(compareLatestDescending);
  if (sorted.length === 0) {
    return undefined;
  }
  if (sorted.length > 1 && compareLatestDescending(sorted[0], sorted[1]) === 0) {
    return undefined;
  }
  return sorted[0];
}

function compareLatestDescending(a: FileEntry, b: FileEntry): number {
  const versionCompare = compareParsedVersions(b.parsed.versionParsed, a.parsed.versionParsed);
  if (versionCompare !== 0) {
    return versionCompare;
  }
  const dateCompare = (b.parsed.dateParsed ?? Number.NEGATIVE_INFINITY) - (
    a.parsed.dateParsed ?? Number.NEGATIVE_INFINITY
  );
  if (dateCompare !== 0) {
    return dateCompare;
  }
  return b.mtime - a.mtime;
}

function hasUnparsedVersionInMultiCandidate(left: FileEntry[], right: FileEntry[]): boolean {
  const hasMultipleCandidates = left.length > 1 || right.length > 1;
  if (!hasMultipleCandidates) {
    return false;
  }
  return [...left, ...right].some((entry) => !entry.parsed.versionParsed);
}

function isMajorMismatch(left: FileEntry, right: FileEntry, config: VersionCompareConfig): boolean {
  if (!config.disambiguation.versionMajorMismatchAsAmbiguous) {
    return false;
  }
  const leftMajor = left.parsed.versionParsed?.numbers[0];
  const rightMajor = right.parsed.versionParsed?.numbers[0];
  return leftMajor !== undefined && rightMajor !== undefined && leftMajor !== rightMajor;
}

function dateDistance(left: FileEntry, right: FileEntry): number {
  const leftDate = left.parsed.dateParsed;
  const rightDate = right.parsed.dateParsed;
  if (leftDate === undefined && rightDate === undefined) {
    return 0;
  }
  if (leftDate === undefined || rightDate === undefined) {
    return 3650;
  }
  return Math.abs(leftDate - rightDate);
}

function normalizedNameDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  const leftTokens = new Set(left.split("_").filter(Boolean));
  const rightTokens = new Set(right.split("_").filter(Boolean));
  const union = new Set([...leftTokens, ...rightTokens]);
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }
  return union.size === 0 ? 1 : 1 - intersection / union.size;
}

function pairItem(bucket: Bucket, left: FileEntry, right: FileEntry, reason: string): MatchResultItem {
  return {
    id: `pair:${bucket.bucketKey}:${left.relativePath}:${right.relativePath}`,
    status: "paired-pending",
    bucketKey: bucket.bucketKey,
    matchKey: bucket.matchKey,
    displayKey: bucket.displayKey,
    left,
    right,
    crossedType: isCrossType(left, right),
    reason,
  };
}

function leftOnlyItem(bucket: Bucket, left: FileEntry): MatchResultItem {
  return {
    id: `left:${bucket.bucketKey}:${left.relativePath}`,
    status: "left-only",
    bucketKey: bucket.bucketKey,
    matchKey: bucket.matchKey,
    displayKey: bucket.displayKey,
    left,
    reason: "no right candidate for matchKey",
  };
}

function rightOnlyItem(bucket: Bucket, right: FileEntry): MatchResultItem {
  return {
    id: `right:${bucket.bucketKey}:${right.relativePath}`,
    status: "right-only",
    bucketKey: bucket.bucketKey,
    matchKey: bucket.matchKey,
    displayKey: bucket.displayKey,
    right,
    reason: "no left candidate for matchKey",
  };
}

function ambiguousItem(
  bucket: Bucket,
  leftCandidates: FileEntry[],
  rightCandidates: FileEntry[],
  reason: string,
): MatchResultItem {
  return {
    id: `ambiguous:${bucket.bucketKey}`,
    status: "ambiguous",
    bucketKey: bucket.bucketKey,
    matchKey: bucket.matchKey,
    displayKey: bucket.displayKey,
    leftCandidates,
    rightCandidates,
    reason,
  };
}

function isCrossType(left: FileEntry, right: FileEntry): boolean {
  const leftType = left.parsed.typePrefixNormalized;
  const rightType = right.parsed.typePrefixNormalized;
  return !!leftType && !!rightType && leftType !== rightType;
}

function manualBucket(left: FileEntry, right: FileEntry, config: VersionCompareConfig): Bucket {
  const leftKeys = makeKeys(left, config);
  const rightKeys = makeKeys(right, config);
  const displayKey = leftKeys.displayKey === rightKeys.displayKey
    ? leftKeys.displayKey
    : `${leftKeys.displayKey} ↔ ${rightKeys.displayKey}`;
  return {
    bucketKey: `manual/${left.relativePath}=>${right.relativePath}`,
    matchKey: `${leftKeys.matchKey}=>${rightKeys.matchKey}`,
    displayKey,
    left: [left],
    right: [right],
  };
}
