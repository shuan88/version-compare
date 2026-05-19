import assert from "node:assert/strict";
import test from "node:test";
import { parseFileName, versionDistance } from "../parser";
import { DEFAULT_VERSION_PATTERNS } from "../defaults";

const settings = {
  versionPatterns: DEFAULT_VERSION_PATTERNS,
  datePattern: "^\\d{8}$",
  ignoreNamePatterns: [],
};

test("parses type prefix, trailing date, and near-tail version", () => {
  const parsed = parseFileName("G-RPT_Sales_Report_1.0P2_20250621.xlsx", settings);

  assert.equal(parsed.typePrefix, "G-RPT");
  assert.deepEqual(parsed.coreTokens, ["sales", "report"]);
  assert.equal(parsed.coreKey, "sales_report");
  assert.equal(parsed.versionRaw, "1.0P2");
  assert.deepEqual(parsed.versionParsed?.numbers, [1, 0, 2]);
  assert.equal(parsed.dateRaw, "20250621");
});

test("keeps type prefix out of core tokens", () => {
  const rpt = parseFileName("G-RPT_Balance_V1.2.pdf", settings);
  const df = parseFileName("G-DF_Balance_V1.2.pdf", settings);

  assert.equal(rpt.coreKey, "balance");
  assert.equal(df.coreKey, "balance");
  assert.equal(rpt.typePrefixNormalized, "g-rpt");
  assert.equal(df.typePrefixNormalized, "g-df");
});

test("only treats tail eight digit token as date", () => {
  const parsed = parseFileName("Report_20250621_Draft.pdf", settings);

  assert.equal(parsed.dateRaw, undefined);
  assert.equal(parsed.coreKey, "report_20250621_draft");
});

test("version distance compares parsed numeric components", () => {
  const left = parseFileName("Report_1.0P2.txt", settings);
  const right = parseFileName("Report_1.0P3.txt", settings);

  assert.equal(versionDistance(left.versionParsed, right.versionParsed), 1);
});

test("removes configured ignored characters before tokenization", () => {
  const parsed = parseFileName("G-RPT_Sales(Reviewed)#_1.0P2.xlsx", {
    ...settings,
    ignoreNamePatterns: ["[()#]"],
  });

  assert.equal(parsed.typePrefix, "G-RPT");
  assert.equal(parsed.coreKey, "salesreviewed");
  assert.equal(parsed.versionRaw, "1.0P2");
});

test("removes configured ignored marker text before matching", () => {
  const parsed = parseFileName("G-RPT_Sales_COPY_1.0.xlsx", {
    ...settings,
    ignoreNamePatterns: ["(?:copy|副本)"],
  });

  assert.equal(parsed.coreKey, "sales");
});
