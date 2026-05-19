import * as path from "path";
import * as vscode from "vscode";
import type { CompareResult, MatchResultItem, ResultStatus, VersionCompareConfig } from "./types";

type TreeNode = GroupNode | ResultNode;

interface GroupNode {
  kind: "group";
  status: ResultStatus;
  label: string;
  items: MatchResultItem[];
  icon: vscode.ThemeIcon;
}

interface ResultNode {
  kind: "result";
  item: MatchResultItem;
}

const GROUPS: Array<{ status: ResultStatus; label: string; icon: vscode.ThemeIcon }> = [
  { status: "paired-modified", label: "Modified", icon: new vscode.ThemeIcon("diff-modified") },
  { status: "paired-identical", label: "Identical", icon: new vscode.ThemeIcon("pass") },
  { status: "left-only", label: "LeftOnly", icon: new vscode.ThemeIcon("arrow-left") },
  { status: "right-only", label: "RightOnly", icon: new vscode.ThemeIcon("arrow-right") },
  { status: "ambiguous", label: "Ambiguous", icon: new vscode.ThemeIcon("warning") },
  { status: "error", label: "Errors", icon: new vscode.ThemeIcon("error") },
];

export class VersionCompareTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly changeEmitter = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private result: CompareResult | undefined;
  private config: VersionCompareConfig | undefined;

  setResult(result: CompareResult | undefined): void {
    this.result = result;
    this.config = result?.config;
    this.changeEmitter.fire();
  }

  getResult(): CompareResult | undefined {
    return this.result;
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.kind === "group") {
      const treeItem = new vscode.TreeItem(
        `${element.label} (${element.items.length})`,
        element.items.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
      );
      treeItem.iconPath = element.icon;
      return treeItem;
    }

    return this.createResultTreeItem(element.item);
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!this.result) {
      return [];
    }

    if (!element) {
      return GROUPS.map((group) => ({
        kind: "group",
        status: group.status,
        label: group.label,
        icon: group.icon,
        items: this.result?.items.filter((item) => item.status === group.status) ?? [],
      }));
    }

    if (element.kind === "group") {
      return element.items.map((item) => ({ kind: "result", item }));
    }

    return [];
  }

  private createResultTreeItem(item: MatchResultItem): vscode.TreeItem {
    const label = this.getItemLabel(item);
    const treeItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    treeItem.id = item.id;
    treeItem.description = this.getDescription(item);
    treeItem.tooltip = this.getTooltip(item);
    treeItem.contextValue = getContextValue(item.status);
    treeItem.iconPath = getIcon(item);
    treeItem.resourceUri = item.left?.uri ?? item.right?.uri;

    if (item.status === "paired-identical" || item.status === "paired-modified") {
      treeItem.command = {
        command: "versionCompare.openDiff",
        title: "Open Diff",
        arguments: [item],
      };
    } else if (item.status === "left-only") {
      treeItem.command = {
        command: "versionCompare.openLeft",
        title: "Open Left",
        arguments: [item],
      };
    } else if (item.status === "right-only") {
      treeItem.command = {
        command: "versionCompare.openRight",
        title: "Open Right",
        arguments: [item],
      };
    } else if (item.status === "ambiguous") {
      treeItem.command = {
        command: "versionCompare.pickMatch",
        title: "Pick Match",
        arguments: [item],
      };
    }

    return treeItem;
  }

  private getItemLabel(item: MatchResultItem): string {
    if (this.config?.displayMode === "originalName") {
      return item.left?.fileName ?? item.right?.fileName ?? item.displayKey;
    }
    return item.displayKey;
  }

  private getDescription(item: MatchResultItem): string {
    if (item.status === "ambiguous") {
      return `Left ${item.leftCandidates?.length ?? 0} | Right ${item.rightCandidates?.length ?? 0}`;
    }
    const left = item.left?.relativePath ? `Left: ${item.left.relativePath}` : undefined;
    const right = item.right?.relativePath ? `Right: ${item.right.relativePath}` : undefined;
    const crossType = item.crossedType ? "cross-type" : undefined;
    return [left, right, crossType].filter(Boolean).join(" | ");
  }

  private getTooltip(item: MatchResultItem): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.isTrusted = false;
    tooltip.appendMarkdown(`**${statusLabel(item.status)}**\n\n`);
    tooltip.appendMarkdown(`- matchKey: \`${item.bucketKey}\`\n`);
    if (item.left) {
      appendFileDetails(tooltip, "Left", item.left);
    }
    if (item.right) {
      appendFileDetails(tooltip, "Right", item.right);
    }
    if (item.leftCandidates?.length) {
      tooltip.appendMarkdown(`- leftCandidates: ${item.leftCandidates.map((entry) => `\`${entry.relativePath}\``).join(", ")}\n`);
    }
    if (item.rightCandidates?.length) {
      tooltip.appendMarkdown(`- rightCandidates: ${item.rightCandidates.map((entry) => `\`${entry.relativePath}\``).join(", ")}\n`);
    }
    tooltip.appendMarkdown(`- reason: ${escapeMarkdown(item.reason)}\n`);
    if (item.error) {
      tooltip.appendMarkdown(`- error: ${escapeMarkdown(item.error)}\n`);
    }
    return tooltip;
  }
}

function appendFileDetails(tooltip: vscode.MarkdownString, label: string, entry: NonNullable<MatchResultItem["left"]>): void {
  tooltip.appendMarkdown(`- ${label}: \`${entry.relativePath}\`\n`);
  tooltip.appendMarkdown(`  - typePrefix: \`${entry.parsed.typePrefix ?? ""}\`\n`);
  tooltip.appendMarkdown(`  - coreKey: \`${entry.parsed.coreKey}\`\n`);
  tooltip.appendMarkdown(`  - version: \`${entry.parsed.versionRaw ?? ""}\`\n`);
  tooltip.appendMarkdown(`  - date: \`${entry.parsed.dateRaw ?? ""}\`\n`);
}

function getContextValue(status: ResultStatus): string {
  if (status === "paired-identical" || status === "paired-modified") {
    return "paired";
  }
  if (status === "left-only") {
    return "leftOnly";
  }
  if (status === "right-only") {
    return "rightOnly";
  }
  if (status === "ambiguous") {
    return "ambiguous";
  }
  return "error";
}

function getIcon(item: MatchResultItem): vscode.ThemeIcon {
  switch (item.status) {
    case "paired-identical":
      return new vscode.ThemeIcon("pass");
    case "paired-modified":
      return new vscode.ThemeIcon("diff-modified");
    case "left-only":
      return new vscode.ThemeIcon("arrow-left");
    case "right-only":
      return new vscode.ThemeIcon("arrow-right");
    case "ambiguous":
      return new vscode.ThemeIcon("warning");
    case "error":
      return new vscode.ThemeIcon("error");
    default:
      return new vscode.ThemeIcon("file");
  }
}

function statusLabel(status: ResultStatus): string {
  switch (status) {
    case "paired-identical":
      return "Paired-Identical";
    case "paired-modified":
      return "Paired-Modified";
    case "left-only":
      return "LeftOnly";
    case "right-only":
      return "RightOnly";
    case "ambiguous":
      return "Ambiguous";
    case "error":
      return "Error";
    default:
      return "Paired";
  }
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&");
}

export function diffTitle(result: CompareResult, item: MatchResultItem): string {
  const leftName = path.basename(result.leftRoot.fsPath);
  const rightName = path.basename(result.rightRoot.fsPath);
  return `${leftName} ↔ ${rightName} : ${item.displayKey}`;
}
