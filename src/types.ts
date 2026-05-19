import type * as vscode from "vscode";
import type { ParsedName } from "./parser";

export type MatchScope = "sameFolder" | "anywhere";
export type ExtPolicy = "sameExtOnly";
export type DisambiguationStrategy = "minDistanceGreedy" | "latestOnEachSide" | "manualPreferred";
export type ContentCompareMethod = "size+hash" | "size+mtime" | "sizeOnly";
export type DisplayMode = "coreKey" | "originalName";

export interface VersionCompareConfig {
  excludeGlobs: string[];
  maxFiles: number;
  matching: {
    scope: MatchScope;
    includeTypePrefix: boolean;
    extPolicy: ExtPolicy;
    versionPatterns: string[];
    datePattern: string;
    ignoreNamePatterns: string[];
  };
  disambiguation: {
    strategy: DisambiguationStrategy;
    ambiguityDeltaThreshold: number;
    versionMajorMismatchAsAmbiguous: boolean;
  };
  contentCompare: ContentCompareMethod;
  manualMatches: Record<string, ManualMatch>;
  ignoreKeys: string[];
  displayMode: DisplayMode;
}

export interface ManualMatch {
  leftRelPath: string;
  rightRelPath: string;
}

export interface FileEntry {
  uri: vscode.Uri;
  relativePath: string;
  dirRelative: string;
  fileName: string;
  nameWithoutExt: string;
  ext: string;
  size: number;
  mtime: number;
  parsed: ParsedName;
}

export interface ScanError {
  path: string;
  side: Side;
  message: string;
  code?: string;
}

export interface ScanResult {
  root: vscode.Uri;
  files: FileEntry[];
  errors: ScanError[];
  elapsedMs: number;
}

export type Side = "left" | "right";

export type ResultStatus =
  | "paired-pending"
  | "paired-identical"
  | "paired-modified"
  | "left-only"
  | "right-only"
  | "ambiguous"
  | "error";

export interface MatchResultItem {
  id: string;
  status: ResultStatus;
  bucketKey: string;
  matchKey: string;
  displayKey: string;
  left?: FileEntry;
  right?: FileEntry;
  leftCandidates?: FileEntry[];
  rightCandidates?: FileEntry[];
  crossedType?: boolean;
  reason: string;
  error?: string;
}

export interface CompareSummary {
  matched: number;
  modified: number;
  identical: number;
  leftOnly: number;
  rightOnly: number;
  ambiguous: number;
  errors: number;
}

export interface CompareResult {
  leftRoot: vscode.Uri;
  rightRoot: vscode.Uri;
  config: VersionCompareConfig;
  items: MatchResultItem[];
  summary: CompareSummary;
  diagnostics: string[];
  elapsedMs: number;
}
