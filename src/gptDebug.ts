import type { CompareResult, FileEntry, MatchResultItem } from "./types";

export interface GptDebugPackage {
  prompt: string;
  markdown: string;
}

export function buildGptDebugPackage(result: CompareResult, importedRegexSource?: string): GptDebugPackage {
  const prompt = buildRegexPrompt(result, importedRegexSource);
  const markdown = [
    "# Version Compare GPT Debug Package",
    "",
    "Copy the prompt below into ChatGPT or another GPT-compatible model. The model should return a JSON regex config that can be imported back into Version Compare.",
    "",
    "## Prompt",
    "",
    "```text",
    prompt,
    "```",
    "",
    "## Filename Inventory",
    "",
    "```json",
    JSON.stringify(buildInventory(result), null, 2),
    "```",
    "",
  ].join("\n");

  return { prompt, markdown };
}

export function buildRegexPrompt(result: CompareResult, importedRegexSource?: string): string {
  const inventory = buildInventory(result);
  return [
    "You are helping configure a VS Code folder comparison extension named Version Compare.",
    "The goal is to generate JavaScript regular expression settings that make equivalent filenames match while avoiding false positives.",
    "",
    "Rules:",
    "- File extensions must remain meaningful; do not suggest matching different extensions unless the user manually forces a pair.",
    "- Type prefixes such as G-RPT and G-DF are semantic by default. Keep includeTypePrefix=true unless the inventory clearly requires cross-type matching.",
    "- Prefer conservative regex patterns. Avoid deleting core report names.",
    "- Regex strings must be valid for JSON settings, so backslashes must be escaped, for example \\\\d{8}.",
    "- Return JSON only. Do not wrap it in markdown.",
    "",
    "Return this JSON shape:",
    "{",
    '  "matching": {',
    '    "scope": "sameFolder",',
    '    "includeTypePrefix": true,',
    '    "ignoreNamePatterns": [],',
    '    "versionPatterns": [],',
    '    "datePattern": "^\\\\d{8}$"',
    "  },",
    '  "notes": ["short explanation of each regex"]',
    "}",
    "",
    importedRegexSource ? `Currently imported regex config source: ${importedRegexSource}` : "No imported regex config source is currently active.",
    "",
    "Current settings snapshot:",
    JSON.stringify({
      scope: result.config.matching.scope,
      includeTypePrefix: result.config.matching.includeTypePrefix,
      versionPatterns: result.config.matching.versionPatterns,
      datePattern: result.config.matching.datePattern,
      ignoreNamePatterns: result.config.matching.ignoreNamePatterns,
    }, null, 2),
    "",
    "Compare summary:",
    JSON.stringify(result.summary, null, 2),
    "",
    "Filename inventory and compare result rows:",
    JSON.stringify(inventory, null, 2),
  ].join("\n");
}

function buildInventory(result: CompareResult): unknown {
  return {
    leftRoot: result.leftRoot.fsPath,
    rightRoot: result.rightRoot.fsPath,
    files: {
      left: uniqueFiles(result.items, "left").map(fileEntryDebug),
      right: uniqueFiles(result.items, "right").map(fileEntryDebug),
    },
    rows: result.items.map(resultItemDebug),
  };
}

function uniqueFiles(items: MatchResultItem[], side: "left" | "right"): FileEntry[] {
  const files: FileEntry[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const candidates = side === "left"
      ? [item.left, ...(item.leftCandidates ?? [])]
      : [item.right, ...(item.rightCandidates ?? [])];
    for (const candidate of candidates) {
      if (candidate && !seen.has(candidate.relativePath)) {
        files.push(candidate);
        seen.add(candidate.relativePath);
      }
    }
  }
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function fileEntryDebug(entry: FileEntry): unknown {
  return {
    relativePath: entry.relativePath,
    dirRelative: entry.dirRelative,
    fileName: entry.fileName,
    ext: entry.ext,
    parsed: {
      typePrefix: entry.parsed.typePrefix,
      coreKey: entry.parsed.coreKey,
      versionRaw: entry.parsed.versionRaw,
      dateRaw: entry.parsed.dateRaw,
    },
  };
}

function resultItemDebug(item: MatchResultItem): unknown {
  return {
    status: item.status,
    matchKey: item.bucketKey,
    left: item.left?.relativePath,
    right: item.right?.relativePath,
    leftCandidates: item.leftCandidates?.map((entry) => entry.relativePath),
    rightCandidates: item.rightCandidates?.map((entry) => entry.relativePath),
    reason: item.reason,
    error: item.error,
  };
}
