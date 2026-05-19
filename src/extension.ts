import * as path from "path";
import * as vscode from "vscode";
import { classifyPairedItems } from "./comparer";
import { loadConfig, updateWorkspaceSetting } from "./config";
import { buildMatchResults } from "./matcher";
import { MaxFilesExceededError, scanFolder } from "./scanner";
import { diffTitle, VersionCompareTreeProvider } from "./tree";
import { CompareViewPanel, type CompareViewState } from "./webview";
import type {
  CompareResult,
  CompareSummary,
  FileEntry,
  ManualMatch,
  MatchResultItem,
  ScanError,
  VersionCompareConfig,
} from "./types";

const LEFT_FOLDER_KEY = "versionCompare.leftFolder";
const RIGHT_FOLDER_KEY = "versionCompare.rightFolder";
const MANUAL_MATCHES_STATE_KEY = "manualMatches";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Version Compare");
  const treeProvider = new VersionCompareTreeProvider();
  const treeView = vscode.window.createTreeView("versionCompare.results", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = "versionCompare.compare";
  statusBar.text = "$(compare-changes) Version Compare";
  statusBar.tooltip = "Run Version Compare";
  statusBar.show();

  context.subscriptions.push(output, treeView, statusBar);

  let compareView: CompareViewPanel;
  const getCompareViewState = (): CompareViewState => ({
    leftRoot: getStoredFolder(context, "left")?.fsPath,
    rightRoot: getStoredFolder(context, "right")?.fsPath,
    result: treeProvider.getResult(),
  });
  compareView = new CompareViewPanel(context, {
    getState: getCompareViewState,
    selectFolder: async (side) => {
      await selectFolder(context, side);
      updateIdleStatus(statusBar, context);
      compareView.updateState();
    },
    compare: async () => {
      await runCompare(context, treeProvider, statusBar, output);
      compareView.updateState();
    },
    changeSettings: async () => {
      await changeSettingsAndRecompare(context, treeProvider, statusBar, output);
      compareView.updateState();
    },
    openDiff: async (itemId) => {
      const item = findResultItem(treeProvider, itemId);
      const result = treeProvider.getResult();
      if (item && result) {
        await openDiff(result, item);
      }
    },
    openLeft: async (itemId) => {
      const item = findResultItem(treeProvider, itemId);
      const uri = item?.left?.uri ?? item?.leftCandidates?.[0]?.uri;
      if (uri) {
        await vscode.window.showTextDocument(uri, { preview: false });
      }
    },
    openRight: async (itemId) => {
      const item = findResultItem(treeProvider, itemId);
      const uri = item?.right?.uri ?? item?.rightCandidates?.[0]?.uri;
      if (uri) {
        await vscode.window.showTextDocument(uri, { preview: false });
      }
    },
    reveal: async (itemId) => {
      const item = findResultItem(treeProvider, itemId);
      const uri = item?.left?.uri ?? item?.right?.uri ?? item?.leftCandidates?.[0]?.uri ?? item?.rightCandidates?.[0]?.uri;
      if (uri) {
        await vscode.commands.executeCommand("revealInExplorer", uri);
      }
    },
    pickMatch: async (itemId) => {
      const item = findResultItem(treeProvider, itemId);
      if (item) {
        await pickMatch(context, item, treeProvider, statusBar, output);
        compareView.updateState();
      }
    },
    ignoreKey: async (itemId) => {
      const item = findResultItem(treeProvider, itemId);
      if (item) {
        await ignoreKey(item, context, treeProvider, statusBar, output);
        compareView.updateState();
      }
    },
    exportJson: async () => exportJson(treeProvider.getResult()),
    exportCsv: async () => exportCsv(treeProvider.getResult()),
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("versionCompare.openCompareView", async () => {
      compareView.show();
    }),
    vscode.commands.registerCommand("versionCompare.selectLeftFolder", async () => {
      await selectFolder(context, "left");
      updateIdleStatus(statusBar, context);
      compareView.updateState();
    }),
    vscode.commands.registerCommand("versionCompare.selectRightFolder", async () => {
      await selectFolder(context, "right");
      updateIdleStatus(statusBar, context);
      compareView.updateState();
    }),
    vscode.commands.registerCommand("versionCompare.compare", async () => {
      await runCompare(context, treeProvider, statusBar, output);
      compareView.updateState();
    }),
    vscode.commands.registerCommand("versionCompare.refresh", async () => {
      await runCompare(context, treeProvider, statusBar, output);
      compareView.updateState();
    }),
    vscode.commands.registerCommand("versionCompare.changeSettingsAndRecompare", async () => {
      await changeSettingsAndRecompare(context, treeProvider, statusBar, output);
      compareView.updateState();
    }),
    vscode.commands.registerCommand("versionCompare.openDiff", async (arg) => {
      const item = resolveResultItem(arg);
      const result = treeProvider.getResult();
      if (item && result) {
        await openDiff(result, item);
      }
    }),
    vscode.commands.registerCommand("versionCompare.openLeft", async (arg) => {
      const item = resolveResultItem(arg);
      if (item?.left) {
        await vscode.window.showTextDocument(item.left.uri, { preview: false });
      }
    }),
    vscode.commands.registerCommand("versionCompare.openRight", async (arg) => {
      const item = resolveResultItem(arg);
      if (item?.right) {
        await vscode.window.showTextDocument(item.right.uri, { preview: false });
      }
    }),
    vscode.commands.registerCommand("versionCompare.revealInExplorer", async (arg) => {
      const item = resolveResultItem(arg);
      const uri = item?.left?.uri ?? item?.right?.uri;
      if (uri) {
        await vscode.commands.executeCommand("revealInExplorer", uri);
      }
    }),
    vscode.commands.registerCommand("versionCompare.copyPaths", async (arg) => {
      const item = resolveResultItem(arg);
      if (item) {
        await vscode.env.clipboard.writeText(collectPaths(item).join("\n"));
      }
    }),
    vscode.commands.registerCommand("versionCompare.pickMatch", async (arg) => {
      const item = resolveResultItem(arg);
      if (item) {
        await pickMatch(context, item, treeProvider, statusBar, output);
        compareView.updateState();
      }
    }),
    vscode.commands.registerCommand("versionCompare.ignoreKey", async (arg) => {
      const item = resolveResultItem(arg);
      if (item) {
        await ignoreKey(item, context, treeProvider, statusBar, output);
        compareView.updateState();
      }
    }),
    vscode.commands.registerCommand("versionCompare.exportJson", async () => {
      await exportJson(treeProvider.getResult());
    }),
    vscode.commands.registerCommand("versionCompare.exportCsv", async () => {
      await exportCsv(treeProvider.getResult());
    }),
  );

  updateIdleStatus(statusBar, context);
}

export function deactivate(): void {
  // VS Code disposes subscriptions registered in activate.
}

async function runCompare(
  context: vscode.ExtensionContext,
  treeProvider: VersionCompareTreeProvider,
  statusBar: vscode.StatusBarItem,
  output: vscode.OutputChannel,
): Promise<CompareResult | undefined> {
  let leftRoot = getStoredFolder(context, "left");
  let rightRoot = getStoredFolder(context, "right");

  if (!leftRoot) {
    leftRoot = await selectFolder(context, "left");
  }
  if (!rightRoot) {
    rightRoot = await selectFolder(context, "right");
  }
  if (!leftRoot || !rightRoot) {
    return undefined;
  }

  const config = loadConfig(context);

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Version Compare",
        cancellable: true,
      },
      async (progress, token) => {
        const started = Date.now();
        output.appendLine("");
        output.appendLine(`[Compare] ${new Date().toISOString()}`);
        output.appendLine(`Left: ${leftRoot.fsPath}`);
        output.appendLine(`Right: ${rightRoot.fsPath}`);
        output.appendLine(
          `Settings: scope=${config.matching.scope} includeTypePrefix=${config.matching.includeTypePrefix} strategy=${config.disambiguation.strategy} contentCompare=${config.contentCompare}`,
        );

        progress.report({ message: "Scanning folders" });
        const [leftScan, rightScan] = await Promise.all([
          scanFolder(leftRoot, "left", config, token, progress),
          scanFolder(rightRoot, "right", config, token, progress),
        ]);

        const totalFiles = leftScan.files.length + rightScan.files.length;
        if (totalFiles > config.maxFiles) {
          throw new MaxFilesExceededError(config.maxFiles);
        }

        output.appendLine(`Scan left: ${leftScan.files.length} files, ${leftScan.errors.length} errors, ${leftScan.elapsedMs} ms`);
        output.appendLine(`Scan right: ${rightScan.files.length} files, ${rightScan.errors.length} errors, ${rightScan.elapsedMs} ms`);
        for (const scanError of [...leftScan.errors, ...rightScan.errors]) {
          output.appendLine(
            `Scan error: side=${scanError.side} path=${scanError.path} code=${scanError.code ?? ""} message=${scanError.message}`,
          );
        }

        progress.report({ message: "Matching candidates" });
        const matchBuild = buildMatchResults(leftScan.files, rightScan.files, config);
        for (const diagnostic of matchBuild.diagnostics) {
          output.appendLine(diagnostic);
        }

        progress.report({ message: "Comparing content" });
        const classified = await classifyPairedItems(matchBuild.items, config);
        const scanErrorItems = [...leftScan.errors, ...rightScan.errors].map(scanErrorToItem);
        const items = [...classified, ...scanErrorItems];
        for (const item of classified.filter((classifiedItem) => classifiedItem.status === "error")) {
          output.appendLine(
            `Compare error: matchKey=${item.bucketKey} left=${item.left?.relativePath ?? ""} right=${item.right?.relativePath ?? ""} message=${item.error ?? ""}`,
          );
        }
        const summary = summarize(items);
        const result: CompareResult = {
          leftRoot,
          rightRoot,
          config,
          items,
          summary,
          diagnostics: matchBuild.diagnostics,
          elapsedMs: Date.now() - started,
        };

        output.appendLine(
          `Summary: matched=${summary.matched} modified=${summary.modified} identical=${summary.identical} leftOnly=${summary.leftOnly} rightOnly=${summary.rightOnly} ambiguous=${summary.ambiguous} errors=${summary.errors}`,
        );
        output.appendLine(`Elapsed: ${result.elapsedMs} ms`);
        return result;
      },
    );

    treeProvider.setResult(result);
    updateResultStatus(statusBar, result);
    void treeViewRevealFirstResult(treeProvider).catch(() => undefined);
    return result;
  } catch (error) {
    if (error instanceof MaxFilesExceededError) {
      void vscode.window.showErrorMessage(`Version Compare stopped: more than ${error.maxFiles} files were found.`);
      return undefined;
    }
    if (error instanceof Error && error.message.includes("cancelled")) {
      void vscode.window.showInformationMessage("Version Compare cancelled.");
      return undefined;
    }
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`Error: ${message}`);
    void vscode.window.showErrorMessage(`Version Compare failed: ${message}`);
    return undefined;
  }
}

async function selectFolder(context: vscode.ExtensionContext, side: "left" | "right"): Promise<vscode.Uri | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: side === "left" ? "Select Left Folder" : "Select Right Folder",
    title: side === "left" ? "Select Left Folder" : "Select Right Folder",
  });
  const uri = picked?.[0];
  if (uri) {
    await context.workspaceState.update(side === "left" ? LEFT_FOLDER_KEY : RIGHT_FOLDER_KEY, uri.toString());
  }
  return uri;
}

function getStoredFolder(context: vscode.ExtensionContext, side: "left" | "right"): vscode.Uri | undefined {
  const value = context.workspaceState.get<string>(side === "left" ? LEFT_FOLDER_KEY : RIGHT_FOLDER_KEY);
  return value ? vscode.Uri.parse(value) : undefined;
}

async function changeSettingsAndRecompare(
  context: vscode.ExtensionContext,
  treeProvider: VersionCompareTreeProvider,
  statusBar: vscode.StatusBarItem,
  output: vscode.OutputChannel,
): Promise<CompareResult | undefined> {
  const config = loadConfig(context);
  const picked = await vscode.window.showQuickPick(
    [
      {
        id: "includeTypePrefix",
        label: `Toggle type prefix matching (${config.matching.includeTypePrefix ? "on" : "off"})`,
        description: "Controls whether G-RPT and G-DF stay separate.",
      },
      {
        id: "scope",
        label: `Change scope (${config.matching.scope})`,
        description: "sameFolder or anywhere.",
      },
      {
        id: "strategy",
        label: `Change disambiguation strategy (${config.disambiguation.strategy})`,
        description: "minDistanceGreedy, latestOnEachSide, or manualPreferred.",
      },
      {
        id: "contentCompare",
        label: `Change content compare (${config.contentCompare})`,
        description: "size+hash, size+mtime, or sizeOnly.",
      },
      {
        id: "openSettings",
        label: "Open Version Compare settings",
        description: "Edit advanced parser, exclude, override, and ignore settings.",
      },
    ],
    { placeHolder: "Select a setting to change, then compare will run again." },
  );

  if (!picked) {
    return undefined;
  }

  if (picked.id === "includeTypePrefix") {
    await updateWorkspaceSetting("matching.includeTypePrefix", !config.matching.includeTypePrefix);
  } else if (picked.id === "scope") {
    const value = await vscode.window.showQuickPick(["sameFolder", "anywhere"], {
      placeHolder: "Matching scope",
    });
    if (!value) {
      return undefined;
    }
    await updateWorkspaceSetting("matching.scope", value);
  } else if (picked.id === "strategy") {
    const value = await vscode.window.showQuickPick(["minDistanceGreedy", "latestOnEachSide", "manualPreferred"], {
      placeHolder: "Disambiguation strategy",
    });
    if (!value) {
      return undefined;
    }
    await updateWorkspaceSetting("disambiguation.strategy", value);
  } else if (picked.id === "contentCompare") {
    const value = await vscode.window.showQuickPick(["size+hash", "size+mtime", "sizeOnly"], {
      placeHolder: "Content compare method",
    });
    if (!value) {
      return undefined;
    }
    await updateWorkspaceSetting("contentCompare", value);
  } else {
    await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:local.version-compare");
    return undefined;
  }

  return runCompare(context, treeProvider, statusBar, output);
}

async function openDiff(result: CompareResult, item: MatchResultItem): Promise<void> {
  if (!item.left || !item.right) {
    return;
  }
  await vscode.commands.executeCommand("vscode.diff", item.left.uri, item.right.uri, diffTitle(result, item));
}

async function pickMatch(
  context: vscode.ExtensionContext,
  item: MatchResultItem,
  treeProvider: VersionCompareTreeProvider,
  statusBar: vscode.StatusBarItem,
  output: vscode.OutputChannel,
): Promise<void> {
  if (item.status !== "ambiguous") {
    return;
  }
  const leftCandidates = item.leftCandidates ?? [];
  const rightCandidates = item.rightCandidates ?? [];
  if (leftCandidates.length === 0 || rightCandidates.length === 0) {
    return;
  }

  const left = leftCandidates.length === 1
    ? leftCandidates[0]
    : await pickCandidate("Select left file", leftCandidates);
  if (!left) {
    return;
  }
  const right = rightCandidates.length === 1
    ? rightCandidates[0]
    : await pickCandidate("Select right file", rightCandidates);
  if (!right) {
    return;
  }

  const config = loadConfig(context);
  const key = `${item.bucketKey}::${left.relativePath}`;
  const nextManualMatches: Record<string, ManualMatch> = {
    ...config.manualMatches,
    [key]: {
      leftRelPath: left.relativePath,
      rightRelPath: right.relativePath,
    },
  };

  await context.workspaceState.update(MANUAL_MATCHES_STATE_KEY, nextManualMatches);
  await updateWorkspaceSetting("manualMatches", nextManualMatches);
  await runCompare(context, treeProvider, statusBar, output);
}

async function pickCandidate(title: string, candidates: FileEntry[]): Promise<FileEntry | undefined> {
  const picked = await vscode.window.showQuickPick(
    candidates.map((entry) => ({
      label: entry.fileName,
      description: entry.relativePath,
      detail: [
        entry.parsed.typePrefix ? `type=${entry.parsed.typePrefix}` : undefined,
        entry.parsed.versionRaw ? `version=${entry.parsed.versionRaw}` : undefined,
        entry.parsed.dateRaw ? `date=${entry.parsed.dateRaw}` : undefined,
      ]
        .filter(Boolean)
        .join(" "),
      entry,
    })),
    { title },
  );
  return picked?.entry;
}

async function ignoreKey(
  item: MatchResultItem,
  context: vscode.ExtensionContext,
  treeProvider: VersionCompareTreeProvider,
  statusBar: vscode.StatusBarItem,
  output: vscode.OutputChannel,
): Promise<void> {
  const config = loadConfig(context);
  const nextIgnoreKeys = [...new Set([...config.ignoreKeys, item.bucketKey])];
  await updateWorkspaceSetting("ignoreKeys", nextIgnoreKeys);
  await runCompare(context, treeProvider, statusBar, output);
}

function resolveResultItem(arg: unknown): MatchResultItem | undefined {
  if (!arg || typeof arg !== "object") {
    return undefined;
  }
  const maybeNode = arg as { kind?: string; item?: MatchResultItem };
  if (maybeNode.kind === "result") {
    return maybeNode.item;
  }
  const maybeItem = arg as MatchResultItem;
  if (typeof maybeItem.status === "string" && typeof maybeItem.bucketKey === "string") {
    return maybeItem;
  }
  return undefined;
}

function findResultItem(treeProvider: VersionCompareTreeProvider, itemId: string): MatchResultItem | undefined {
  return treeProvider.getResult()?.items.find((item) => item.id === itemId);
}

function summarize(items: MatchResultItem[]): CompareSummary {
  const modified = items.filter((item) => item.status === "paired-modified").length;
  const identical = items.filter((item) => item.status === "paired-identical").length;
  return {
    matched: modified + identical,
    modified,
    identical,
    leftOnly: items.filter((item) => item.status === "left-only").length,
    rightOnly: items.filter((item) => item.status === "right-only").length,
    ambiguous: items.filter((item) => item.status === "ambiguous").length,
    errors: items.filter((item) => item.status === "error").length,
  };
}

function scanErrorToItem(error: ScanError): MatchResultItem {
  const displayName = path.basename(error.path) || error.path;
  return {
    id: `error:${error.side}:${error.path}`,
    status: "error",
    bucketKey: `${error.side}:${error.path}`,
    matchKey: `${error.side}:${error.path}`,
    displayKey: displayName,
    reason: `${error.side} scan error${error.code ? ` (${error.code})` : ""}`,
    error: error.message,
  };
}

function updateIdleStatus(statusBar: vscode.StatusBarItem, context: vscode.ExtensionContext): void {
  const left = getStoredFolder(context, "left");
  const right = getStoredFolder(context, "right");
  const leftName = left ? path.basename(left.fsPath) : "Left?";
  const rightName = right ? path.basename(right.fsPath) : "Right?";
  statusBar.text = `$(compare-changes) ${leftName} ↔ ${rightName}`;
  statusBar.tooltip = "Version Compare: click to compare";
}

function updateResultStatus(statusBar: vscode.StatusBarItem, result: CompareResult): void {
  const summary = result.summary;
  statusBar.text = `$(compare-changes) M:${summary.modified} =:${summary.identical} L:${summary.leftOnly} R:${summary.rightOnly} ?:${summary.ambiguous}`;
  statusBar.tooltip = [
    `Matched: ${summary.matched}`,
    `Modified: ${summary.modified}`,
    `Identical: ${summary.identical}`,
    `LeftOnly: ${summary.leftOnly}`,
    `RightOnly: ${summary.rightOnly}`,
    `Ambiguous: ${summary.ambiguous}`,
    `Errors: ${summary.errors}`,
    `Elapsed: ${result.elapsedMs} ms`,
  ].join("\n");
}

async function exportJson(result: CompareResult | undefined): Promise<void> {
  if (!result) {
    void vscode.window.showWarningMessage("No Version Compare result to export.");
    return;
  }
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file("version-compare-report.json"),
    filters: { JSON: ["json"] },
  });
  if (!uri) {
    return;
  }

  const payload = JSON.stringify(toReportObject(result), null, 2);
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(payload));
}

async function exportCsv(result: CompareResult | undefined): Promise<void> {
  if (!result) {
    void vscode.window.showWarningMessage("No Version Compare result to export.");
    return;
  }
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file("version-compare-report.csv"),
    filters: { CSV: ["csv"] },
  });
  if (!uri) {
    return;
  }

  const rows = [
    ["status", "matchKey", "left", "right", "reason", "error"],
    ...result.items.map((item) => [
      item.status,
      item.bucketKey,
      item.left?.relativePath ?? candidateSummary(item.leftCandidates),
      item.right?.relativePath ?? candidateSummary(item.rightCandidates),
      item.reason,
      item.error ?? "",
    ]),
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(csv));
}

function toReportObject(result: CompareResult): unknown {
  return {
    leftRoot: result.leftRoot.fsPath,
    rightRoot: result.rightRoot.fsPath,
    summary: result.summary,
    elapsedMs: result.elapsedMs,
    config: result.config,
    items: result.items.map((item) => ({
      status: item.status,
      matchKey: item.bucketKey,
      displayKey: item.displayKey,
      left: item.left ? fileEntryReport(item.left) : undefined,
      right: item.right ? fileEntryReport(item.right) : undefined,
      leftCandidates: item.leftCandidates?.map(fileEntryReport),
      rightCandidates: item.rightCandidates?.map(fileEntryReport),
      crossedType: item.crossedType,
      reason: item.reason,
      error: item.error,
    })),
  };
}

function fileEntryReport(entry: FileEntry): unknown {
  return {
    uri: entry.uri.toString(),
    relativePath: entry.relativePath,
    dirRelative: entry.dirRelative,
    fileName: entry.fileName,
    ext: entry.ext,
    size: entry.size,
    mtime: entry.mtime,
    parsed: entry.parsed,
  };
}

function candidateSummary(candidates: FileEntry[] | undefined): string {
  return candidates?.map((entry) => entry.relativePath).join(" | ") ?? "";
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function collectPaths(item: MatchResultItem): string[] {
  return [
    item.left?.uri.fsPath,
    item.right?.uri.fsPath,
    ...(item.leftCandidates?.map((entry) => entry.uri.fsPath) ?? []),
    ...(item.rightCandidates?.map((entry) => entry.uri.fsPath) ?? []),
  ].filter((value): value is string => Boolean(value));
}

async function treeViewRevealFirstResult(treeProvider: VersionCompareTreeProvider): Promise<void> {
  const result = treeProvider.getResult();
  if (!result || result.items.length === 0) {
    return;
  }
  await vscode.commands.executeCommand("versionCompare.results.focus");
}
