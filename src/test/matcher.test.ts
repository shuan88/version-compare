import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_EXCLUDE_GLOBS, DEFAULT_VERSION_PATTERNS } from "../defaults";
import { buildMatchResults } from "../matcher";
import { parseFileName } from "../parser";
import type { FileEntry, VersionCompareConfig } from "../types";

function config(overrides: Partial<VersionCompareConfig> = {}): VersionCompareConfig {
  const base: VersionCompareConfig = {
    excludeGlobs: DEFAULT_EXCLUDE_GLOBS,
    maxFiles: 50000,
    matching: {
      scope: "sameFolder",
      includeTypePrefix: true,
      extPolicy: "sameExtOnly",
      versionPatterns: DEFAULT_VERSION_PATTERNS,
      datePattern: "^\\d{8}$",
    },
    disambiguation: {
      strategy: "minDistanceGreedy",
      ambiguityDeltaThreshold: 1,
      versionMajorMismatchAsAmbiguous: false,
    },
    contentCompare: "sizeOnly",
    manualMatches: {},
    ignoreKeys: [],
    displayMode: "coreKey",
  };

  return {
    ...base,
    ...overrides,
    matching: {
      ...base.matching,
      ...overrides.matching,
    },
    disambiguation: {
      ...base.disambiguation,
      ...overrides.disambiguation,
    },
  };
}

function entry(relativePath: string): FileEntry {
  const fileName = relativePath.split("/").pop() ?? relativePath;
  const dot = fileName.lastIndexOf(".");
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLocaleLowerCase() : "";
  const nameWithoutExt = dot >= 0 ? fileName.slice(0, dot) : fileName;
  const dirRelative = relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/")) : "";
  return {
    uri: { fsPath: `/tmp/${relativePath}`, toString: () => `/tmp/${relativePath}` } as never,
    relativePath,
    dirRelative,
    fileName,
    nameWithoutExt,
    ext,
    size: 1,
    mtime: 1,
    parsed: parseFileName(fileName, {
      versionPatterns: DEFAULT_VERSION_PATTERNS,
      datePattern: "^\\d{8}$",
    }),
  };
}

test("pairs same core key with different versions and dates", () => {
  const result = buildMatchResults(
    [entry("Reports/G-RPT_Sales_1.0P2_20250621.xlsx")],
    [entry("Reports/G-RPT_Sales_1.0P3_20250622.xlsx")],
    config(),
  );

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].status, "paired-pending");
});

test("does not pair different extensions", () => {
  const result = buildMatchResults(
    [entry("Reports/G-RPT_Sales_1.0P2.xlsx")],
    [entry("Reports/G-RPT_Sales_1.0P2.pdf")],
    config(),
  );

  assert.equal(result.items.filter((item) => item.status === "left-only").length, 1);
  assert.equal(result.items.filter((item) => item.status === "right-only").length, 1);
});

test("keeps different type prefixes separate by default", () => {
  const result = buildMatchResults(
    [entry("Reports/G-RPT_Sales_1.0P2.xlsx")],
    [entry("Reports/G-DF_Sales_1.0P2.xlsx")],
    config(),
  );

  assert.equal(result.items.filter((item) => item.status === "left-only").length, 1);
  assert.equal(result.items.filter((item) => item.status === "right-only").length, 1);
});

test("allows cross type pairing when type prefix is disabled", () => {
  const result = buildMatchResults(
    [entry("Reports/G-RPT_Sales_1.0P2.xlsx")],
    [entry("Reports/G-DF_Sales_1.0P2.xlsx")],
    config({ matching: { includeTypePrefix: false } as VersionCompareConfig["matching"] }),
  );

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].status, "paired-pending");
  assert.equal(result.items[0].crossedType, true);
});

test("marks multi-candidate bucket ambiguous when version parsing fails", () => {
  const result = buildMatchResults(
    [entry("Reports/G-RPT_Sales_Draft.xlsx"), entry("Reports/G-RPT_Sales_Final.xlsx")],
    [entry("Reports/G-RPT_Sales_A.xlsx")],
    config({ matching: { includeTypePrefix: true } as VersionCompareConfig["matching"] }),
  );

  assert.equal(result.items.some((item) => item.status === "ambiguous"), false);

  const ambiguous = buildMatchResults(
    [entry("Reports/G-RPT_Sales_Alpha.xlsx"), entry("Reports/G-RPT_Sales_Alpha.xlsx")],
    [entry("Reports/G-RPT_Sales_Alpha.xlsx"), entry("Reports/G-RPT_Sales_Alpha.xlsx")],
    config(),
  );

  assert.equal(ambiguous.items[0].status, "ambiguous");
});
