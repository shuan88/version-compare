import * as fs from "fs/promises";
import type { Dirent } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { parseFileName } from "./parser";
import type { FileEntry, ScanError, ScanResult, Side, VersionCompareConfig } from "./types";

export class MaxFilesExceededError extends Error {
  constructor(readonly maxFiles: number) {
    super(`File count exceeded configured maximum (${maxFiles}).`);
  }
}

interface ExcludeRule {
  raw: string;
  regex: RegExp;
  directoryName?: string;
  basenameRegex?: RegExp;
}

export async function scanFolder(
  root: vscode.Uri,
  side: Side,
  config: VersionCompareConfig,
  token: vscode.CancellationToken,
  progress?: vscode.Progress<{ message?: string; increment?: number }>,
): Promise<ScanResult> {
  const started = Date.now();
  const rules = compileExcludeRules(config.excludeGlobs);
  const files: FileEntry[] = [];
  const errors: ScanError[] = [];
  const rootPath = root.fsPath;

  await walk(rootPath);

  return {
    root,
    files,
    errors,
    elapsedMs: Date.now() - started,
  };

  async function walk(currentPath: string): Promise<void> {
    throwIfCancelled(token);
    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      errors.push(toScanError(currentPath, side, error));
      return;
    }

    for (const entry of entries) {
      throwIfCancelled(token);
      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = normalizePath(path.relative(rootPath, absolutePath));
      const isDirectory = entry.isDirectory();

      if (isExcluded(relativePath, isDirectory, rules)) {
        continue;
      }

      if (isDirectory) {
        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      let stat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stat = await fs.stat(absolutePath);
      } catch (error) {
        errors.push(toScanError(absolutePath, side, error));
        continue;
      }

      const fileName = entry.name;
      const extWithDot = path.extname(fileName);
      const ext = extWithDot.startsWith(".") ? extWithDot.slice(1).toLocaleLowerCase() : "";
      const nameWithoutExt = extWithDot ? fileName.slice(0, -extWithDot.length) : fileName;
      const slashIndex = relativePath.lastIndexOf("/");
      const dirRelative = slashIndex >= 0 ? relativePath.slice(0, slashIndex) : "";

      files.push({
        uri: vscode.Uri.file(absolutePath),
        relativePath,
        dirRelative,
        fileName,
        nameWithoutExt,
        ext,
        size: stat.size,
        mtime: stat.mtimeMs,
        parsed: parseFileName(fileName, {
          versionPatterns: config.matching.versionPatterns,
          datePattern: config.matching.datePattern,
          ignoreNamePatterns: config.matching.ignoreNamePatterns,
        }),
      });

      if (files.length > config.maxFiles) {
        throw new MaxFilesExceededError(config.maxFiles);
      }

      if (files.length % 100 === 0) {
        progress?.report({ message: `${side}: ${files.length} files` });
      }
    }
  }
}

function compileExcludeRules(globs: string[]): ExcludeRule[] {
  return globs
    .map((glob) => glob.trim())
    .filter(Boolean)
    .map((raw) => {
      const normalized = normalizePath(raw).replace(/^\.\//, "");
      const directoryName = extractDirectorySegmentRule(normalized);
      const regex = globToRegex(normalized.endsWith("/") ? `${normalized}**` : normalized);
      const basenameRegex = normalized.includes("/") ? undefined : globToRegex(normalized);
      return {
        raw,
        regex,
        directoryName,
        basenameRegex,
      };
    });
}

function isExcluded(relativePath: string, isDirectory: boolean, rules: ExcludeRule[]): boolean {
  const normalized = normalizePath(relativePath);
  const withDirectorySlash = isDirectory ? `${normalized}/` : normalized;
  const basename = normalized.split("/").pop() ?? normalized;
  const segments = normalized.split("/");

  return rules.some((rule) => {
    if (rule.directoryName && segments.includes(rule.directoryName)) {
      return true;
    }
    if (rule.regex.test(normalized) || rule.regex.test(withDirectorySlash)) {
      return true;
    }
    return rule.basenameRegex?.test(basename) ?? false;
  });
}

function extractDirectorySegmentRule(glob: string): string | undefined {
  const cleaned = glob.replace(/\/\*\*$/, "").replace(/\/$/, "");
  if (/[*?\[\]{}]/.test(cleaned)) {
    return undefined;
  }
  if (cleaned.includes("/")) {
    return undefined;
  }
  return cleaned;
}

function globToRegex(glob: string): RegExp {
  let source = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];

    if (char === "*") {
      if (next === "*") {
        const afterNext = glob[index + 2];
        if (afterNext === "/") {
          source += "(?:.*/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        source += "[^/]*";
      }
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    source += escapeRegex(char);
  }
  source += "$";
  return new RegExp(source);
}

function escapeRegex(char: string): string {
  return /[|\\{}()[\]^$+?.]/.test(char) ? `\\${char}` : char;
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

function throwIfCancelled(token: vscode.CancellationToken): void {
  if (token.isCancellationRequested) {
    throw new Error("Version Compare operation was cancelled.");
  }
}

function toScanError(filePath: string, side: Side, error: unknown): ScanError {
  const nodeError = error as NodeJS.ErrnoException;
  return {
    path: filePath,
    side,
    message: nodeError.message ?? String(error),
    code: nodeError.code,
  };
}
