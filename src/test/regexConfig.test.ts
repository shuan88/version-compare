import assert from "node:assert/strict";
import test from "node:test";
import { parseImportedRegexConfig } from "../regexConfig";

test("parses nested imported regex config", () => {
  const parsed = parseImportedRegexConfig(JSON.stringify({
    matching: {
      scope: "anywhere",
      includeTypePrefix: false,
      ignoreNamePatterns: ["[()#]"],
      versionPatterns: ["^v\\d+$"],
      datePattern: "^\\d{8}$",
    },
  }));

  assert.equal(parsed.scope, "anywhere");
  assert.equal(parsed.includeTypePrefix, false);
  assert.deepEqual(parsed.ignoreNamePatterns, ["[()#]"]);
  assert.deepEqual(parsed.versionPatterns, ["^v\\d+$"]);
  assert.equal(parsed.datePattern, "^\\d{8}$");
});

test("rejects unsupported imported regex config values", () => {
  assert.throws(
    () => parseImportedRegexConfig(JSON.stringify({ matching: { scope: "nearby" } })),
    /scope must be sameFolder or anywhere/,
  );
});
