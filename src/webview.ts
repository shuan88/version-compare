import * as vscode from "vscode";
import type { CompareResult, MatchResultItem, ResultStatus } from "./types";

export interface CompareViewState {
  leftRoot?: string;
  rightRoot?: string;
  result?: CompareResult;
}

export interface CompareViewCallbacks {
  getState(): CompareViewState;
  selectFolder(side: "left" | "right"): Promise<void>;
  compare(): Promise<void>;
  changeSettings(): Promise<void>;
  openDiff(itemId: string): Promise<void>;
  openLeft(itemId: string): Promise<void>;
  openRight(itemId: string): Promise<void>;
  reveal(itemId: string): Promise<void>;
  pickMatch(itemId: string): Promise<void>;
  forceMatch(itemId: string): Promise<void>;
  ignoreKey(itemId: string): Promise<void>;
  exportJson(): Promise<void>;
  exportCsv(): Promise<void>;
  exportGptDebugPackage(): Promise<void>;
  askGptForRegex(): Promise<void>;
  importRegexConfig(): Promise<void>;
}

interface WebviewResultItem {
  id: string;
  status: ResultStatus;
  label: string;
  leftPath: string;
  rightPath: string;
  leftName: string;
  rightName: string;
  reason: string;
  error: string;
  crossedType: boolean;
  canDiff: boolean;
  canPick: boolean;
  canForce: boolean;
}

export class CompareViewPanel {
  private panel: vscode.WebviewPanel | undefined;
  private busy = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly callbacks: CompareViewCallbacks,
  ) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.postState();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "versionCompare.compareView",
      "Version Compare",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "assets")],
      },
    );
    this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, "assets", "icon.png");
    this.panel.webview.html = this.getHtml(this.panel.webview);
    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleMessage(message);
    });
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  updateState(): void {
    this.postState();
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== "object") {
      return;
    }
    const command = (message as { command?: string }).command;
    const itemId = (message as { itemId?: string }).itemId;

    switch (command) {
      case "ready":
        this.postState();
        return;
      case "selectLeft":
        await this.runBusyTask(() => this.callbacks.selectFolder("left"));
        return;
      case "selectRight":
        await this.runBusyTask(() => this.callbacks.selectFolder("right"));
        return;
      case "compare":
      case "refresh":
        await this.runBusyTask(() => this.callbacks.compare());
        return;
      case "settings":
        await this.runBusyTask(() => this.callbacks.changeSettings());
        return;
      case "exportJson":
        await this.callbacks.exportJson();
        return;
      case "exportCsv":
        await this.callbacks.exportCsv();
        return;
      case "exportGptDebugPackage":
        await this.callbacks.exportGptDebugPackage();
        return;
      case "askGptForRegex":
        await this.runBusyTask(() => this.callbacks.askGptForRegex());
        return;
      case "importRegexConfig":
        await this.runBusyTask(() => this.callbacks.importRegexConfig());
        return;
      case "openDiff":
        if (itemId) {
          await this.callbacks.openDiff(itemId);
        }
        return;
      case "openLeft":
        if (itemId) {
          await this.callbacks.openLeft(itemId);
        }
        return;
      case "openRight":
        if (itemId) {
          await this.callbacks.openRight(itemId);
        }
        return;
      case "reveal":
        if (itemId) {
          await this.callbacks.reveal(itemId);
        }
        return;
      case "pickMatch":
        if (itemId) {
          await this.runBusyTask(() => this.callbacks.pickMatch(itemId));
        }
        return;
      case "forceMatch":
        if (itemId) {
          await this.runBusyTask(() => this.callbacks.forceMatch(itemId));
        }
        return;
      case "ignoreKey":
        if (itemId) {
          await this.runBusyTask(() => this.callbacks.ignoreKey(itemId));
        }
        return;
    }
  }

  private async runBusyTask(task: () => Promise<void>): Promise<void> {
    this.busy = true;
    this.postState();
    try {
      await task();
    } finally {
      this.busy = false;
      this.postState();
    }
  }

  private postState(): void {
    if (!this.panel) {
      return;
    }
    const state = this.callbacks.getState();
    void this.panel.webview.postMessage({
      command: "state",
      busy: this.busy,
      leftRoot: state.leftRoot,
      rightRoot: state.rightRoot,
      result: state.result ? serializeResult(state.result) : undefined,
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "assets", "icon.png"));
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource}`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Version Compare</title>
  <style>
    :root {
      color-scheme: light dark;
      --vc-border: var(--vscode-panel-border);
      --vc-row: color-mix(in srgb, var(--vscode-editor-foreground) 5%, transparent);
      --vc-row-hover: color-mix(in srgb, var(--vscode-editor-foreground) 9%, transparent);
      --vc-muted: var(--vscode-descriptionForeground);
      --vc-modified: #f2a541;
      --vc-identical: #2aa198;
      --vc-left: #4b9eff;
      --vc-right: #d28cff;
      --vc-ambiguous: #dcdcaa;
      --vc-error: #f48771;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      font: var(--vscode-font-size) var(--vscode-font-family);
    }
    button, select {
      font: inherit;
    }
    button {
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 4px;
      min-height: 28px;
      padding: 4px 10px;
      cursor: pointer;
      white-space: nowrap;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button.ghost {
      background: transparent;
      color: var(--vscode-foreground);
      border-color: var(--vc-border);
    }
    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .shell {
      display: grid;
      grid-template-rows: auto auto auto 1fr;
      min-height: 100vh;
    }
    .topbar {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--vc-border);
    }
    .brand {
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 180px;
      font-weight: 600;
    }
    .brand img {
      width: 28px;
      height: 28px;
      border-radius: 6px;
    }
    .paths {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 10px;
      min-width: 0;
    }
    .pathbox {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 8px;
      align-items: center;
      min-width: 0;
      padding: 7px 9px;
      border: 1px solid var(--vc-border);
      border-radius: 6px;
      background: var(--vscode-sideBar-background);
    }
    .pathlabel {
      color: var(--vc-muted);
      font-size: 11px;
      text-transform: uppercase;
    }
    .pathvalue {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      align-items: center;
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      padding: 10px 16px;
      border-bottom: 1px solid var(--vc-border);
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 26px;
      border: 1px solid var(--vc-border);
      border-radius: 4px;
      padding: 3px 8px;
      background: var(--vscode-editorWidget-background);
    }
    .chip strong { font-weight: 600; }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--vc-muted);
      flex: 0 0 auto;
    }
    .dot.modified { background: var(--vc-modified); }
    .dot.identical { background: var(--vc-identical); }
    .dot.left { background: var(--vc-left); }
    .dot.right { background: var(--vc-right); }
    .dot.ambiguous { background: var(--vc-ambiguous); }
    .dot.error { background: var(--vc-error); }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 9px 16px;
      border-bottom: 1px solid var(--vc-border);
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .filter {
      background: transparent;
      color: var(--vscode-foreground);
      border-color: var(--vc-border);
    }
    .filter.active {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .tablewrap {
      min-height: 0;
      overflow: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    thead th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vc-border);
      color: var(--vc-muted);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0;
      text-align: left;
      text-transform: uppercase;
      padding: 8px 12px;
    }
    tbody tr {
      border-bottom: 1px solid color-mix(in srgb, var(--vc-border) 65%, transparent);
      background: transparent;
    }
    tbody tr:nth-child(2n) { background: var(--vc-row); }
    tbody tr:hover { background: var(--vc-row-hover); }
    td {
      padding: 9px 12px;
      vertical-align: top;
      min-width: 0;
    }
    .filecell {
      display: grid;
      gap: 3px;
      min-width: 0;
    }
    .filename {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
    }
    .filepath {
      color: var(--vc-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
    }
    .statuscell {
      display: grid;
      gap: 7px;
      align-content: start;
    }
    .statusline {
      display: flex;
      gap: 6px;
      align-items: center;
      min-width: 0;
      font-weight: 600;
    }
    .reason {
      color: var(--vc-muted);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rowactions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .rowactions button {
      min-height: 24px;
      padding: 2px 7px;
      font-size: 12px;
    }
    .empty {
      display: grid;
      place-content: center;
      min-height: 360px;
      color: var(--vc-muted);
      text-align: center;
      gap: 10px;
      padding: 24px;
    }
    .empty strong {
      color: var(--vscode-editor-foreground);
      font-size: 16px;
    }
    .busy {
      position: fixed;
      right: 14px;
      bottom: 14px;
      display: none;
      border: 1px solid var(--vc-border);
      border-radius: 6px;
      padding: 7px 10px;
      background: var(--vscode-notifications-background);
      color: var(--vscode-notifications-foreground);
      box-shadow: 0 6px 18px color-mix(in srgb, black 25%, transparent);
    }
    .busy.visible { display: block; }
    @media (max-width: 920px) {
      .topbar {
        grid-template-columns: 1fr;
      }
      .brand { min-width: 0; }
      .paths {
        grid-template-columns: 1fr;
      }
      .actions {
        justify-content: flex-start;
        flex-wrap: wrap;
      }
      .toolbar {
        grid-template-columns: 1fr;
      }
      table { min-width: 760px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <img src="${iconUri}" alt="">
        <span>Version Compare</span>
      </div>
      <div class="paths">
        <button class="pathbox" id="selectLeft" title="Select left folder">
          <span class="pathlabel">Left</span>
          <span class="pathvalue" id="leftPath">Not selected</span>
        </button>
        <button class="pathbox" id="selectRight" title="Select right folder">
          <span class="pathlabel">Right</span>
          <span class="pathvalue" id="rightPath">Not selected</span>
        </button>
      </div>
      <div class="actions">
        <button id="compareButton">Compare</button>
        <button class="secondary" id="refreshButton">Refresh</button>
        <button class="ghost" id="settingsButton">Settings</button>
        <button class="ghost" id="importRegexConfig">Import Regex</button>
      </div>
    </header>

    <section class="summary" id="summary"></section>

    <section class="toolbar">
      <div class="filters" id="filters"></div>
      <div class="actions">
        <button class="ghost" id="exportJson">Export JSON</button>
        <button class="ghost" id="exportCsv">Export CSV</button>
        <button class="ghost" id="exportGptDebugPackage">GPT Debug</button>
        <button class="ghost" id="askGptForRegex">Ask GPT</button>
      </div>
    </section>

    <main class="tablewrap" id="content"></main>
  </div>
  <div class="busy" id="busy">Working...</div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const statusOrder = ["all", "paired-modified", "paired-identical", "left-only", "right-only", "ambiguous", "error"];
    const statusLabels = {
      "all": "All",
      "paired-modified": "Modified",
      "paired-identical": "Identical",
      "left-only": "LeftOnly",
      "right-only": "RightOnly",
      "ambiguous": "Ambiguous",
      "error": "Errors"
    };
    const dotClass = {
      "paired-modified": "modified",
      "paired-identical": "identical",
      "left-only": "left",
      "right-only": "right",
      "ambiguous": "ambiguous",
      "error": "error"
    };
    let state = { busy: false, leftRoot: "", rightRoot: "", result: undefined };
    let filter = "all";

    document.getElementById("selectLeft").addEventListener("click", () => post("selectLeft"));
    document.getElementById("selectRight").addEventListener("click", () => post("selectRight"));
    document.getElementById("compareButton").addEventListener("click", () => post("compare"));
    document.getElementById("refreshButton").addEventListener("click", () => post("refresh"));
    document.getElementById("settingsButton").addEventListener("click", () => post("settings"));
    document.getElementById("importRegexConfig").addEventListener("click", () => post("importRegexConfig"));
    document.getElementById("exportJson").addEventListener("click", () => post("exportJson"));
    document.getElementById("exportCsv").addEventListener("click", () => post("exportCsv"));
    document.getElementById("exportGptDebugPackage").addEventListener("click", () => post("exportGptDebugPackage"));
    document.getElementById("askGptForRegex").addEventListener("click", () => post("askGptForRegex"));

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message.command === "state") {
        state = message;
        render();
      }
    });

    post("ready");

    function post(command, payload = {}) {
      vscode.postMessage({ command, ...payload });
    }

    function render() {
      document.getElementById("leftPath").textContent = state.leftRoot || "Not selected";
      document.getElementById("rightPath").textContent = state.rightRoot || "Not selected";
      document.getElementById("busy").classList.toggle("visible", Boolean(state.busy));
      const hasFolders = Boolean(state.leftRoot && state.rightRoot);
      document.getElementById("compareButton").disabled = state.busy || !hasFolders;
      document.getElementById("refreshButton").disabled = state.busy || !hasFolders;
      document.getElementById("settingsButton").disabled = state.busy;
      document.getElementById("importRegexConfig").disabled = state.busy;
      document.getElementById("exportJson").disabled = !state.result;
      document.getElementById("exportCsv").disabled = !state.result;
      document.getElementById("exportGptDebugPackage").disabled = !state.result;
      document.getElementById("askGptForRegex").disabled = state.busy || !state.result;
      renderSummary();
      renderFilters();
      renderContent();
    }

    function renderSummary() {
      const summary = state.result?.summary;
      const items = [
        ["matched", "Matched", summary?.matched ?? 0, ""],
        ["paired-modified", "Modified", summary?.modified ?? 0, "modified"],
        ["paired-identical", "Identical", summary?.identical ?? 0, "identical"],
        ["left-only", "LeftOnly", summary?.leftOnly ?? 0, "left"],
        ["right-only", "RightOnly", summary?.rightOnly ?? 0, "right"],
        ["ambiguous", "Ambiguous", summary?.ambiguous ?? 0, "ambiguous"],
        ["error", "Errors", summary?.errors ?? 0, "error"]
      ];
      document.getElementById("summary").innerHTML = items.map(([, label, value, klass]) => (
        '<span class="chip"><span class="dot ' + klass + '"></span><span>' + label + '</span><strong>' + value + '</strong></span>'
      )).join("");
    }

    function renderFilters() {
      const counts = countByStatus(state.result?.items ?? []);
      document.getElementById("filters").innerHTML = statusOrder.map((status) => {
        const count = status === "all" ? (state.result?.items.length ?? 0) : (counts[status] ?? 0);
        return '<button class="filter ' + (filter === status ? "active" : "") + '" data-filter="' + status + '">' +
          statusLabels[status] + ' (' + count + ')' +
          '</button>';
      }).join("");
      for (const button of document.querySelectorAll("[data-filter]")) {
        button.addEventListener("click", () => {
          filter = button.dataset.filter;
          render();
        });
      }
    }

    function renderContent() {
      const items = (state.result?.items ?? []).filter((item) => filter === "all" || item.status === filter);
      const content = document.getElementById("content");
      if (!state.result) {
        content.innerHTML = '<div class="empty"><strong>Select folders to compare</strong><span>Use the Left and Right folder controls above, then run Compare.</span></div>';
        return;
      }
      if (items.length === 0) {
        content.innerHTML = '<div class="empty"><strong>No rows in this filter</strong><span>Choose another status filter.</span></div>';
        return;
      }
      content.innerHTML = '<table><thead><tr><th>Left</th><th>Status</th><th>Right</th></tr></thead><tbody>' +
        items.map(renderRow).join("") +
        '</tbody></table>';
      for (const row of content.querySelectorAll("tr[data-id]")) {
        row.addEventListener("dblclick", () => {
          const id = row.dataset.id;
          const item = items.find((candidate) => candidate.id === id);
          if (item?.canDiff) {
            post("openDiff", { itemId: id });
          }
        });
      }
      for (const button of content.querySelectorAll("button[data-command]")) {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          post(button.dataset.command, { itemId: button.dataset.itemId });
        });
      }
    }

    function renderRow(item) {
      return '<tr data-id="' + escapeAttribute(item.id) + '">' +
        '<td>' + renderFileCell(item.leftName, item.leftPath) + '</td>' +
        '<td>' + renderStatusCell(item) + '</td>' +
        '<td>' + renderFileCell(item.rightName, item.rightPath) + '</td>' +
        '</tr>';
    }

    function renderFileCell(name, relPath) {
      if (!name && !relPath) {
        return '<span class="filepath">-</span>';
      }
      return '<div class="filecell">' +
        '<div class="filename" title="' + escapeAttribute(name || relPath) + '">' + escapeHtml(name || relPath) + '</div>' +
        '<div class="filepath" title="' + escapeAttribute(relPath) + '">' + escapeHtml(relPath) + '</div>' +
        '</div>';
    }

    function renderStatusCell(item) {
      const label = statusLabels[item.status] ?? item.status;
      const reason = item.error || item.reason || "";
      const actions = [];
      if (item.canDiff) actions.push(actionButton("openDiff", item.id, "Diff"));
      if (item.leftPath) actions.push(actionButton("openLeft", item.id, "Open L"));
      if (item.rightPath) actions.push(actionButton("openRight", item.id, "Open R"));
      if (item.leftPath || item.rightPath) actions.push(actionButton("reveal", item.id, "Reveal"));
      if (item.canPick) actions.push(actionButton("pickMatch", item.id, "Pick"));
      if (item.canForce) actions.push(actionButton("forceMatch", item.id, "Force"));
      actions.push(actionButton("ignoreKey", item.id, "Ignore"));
      return '<div class="statuscell">' +
        '<div class="statusline"><span class="dot ' + (dotClass[item.status] ?? "") + '"></span><span>' + escapeHtml(label) + '</span>' +
        (item.crossedType ? '<span class="chip">cross type</span>' : '') +
        '</div>' +
        '<div class="reason" title="' + escapeAttribute(reason) + '">' + escapeHtml(reason) + '</div>' +
        '<div class="rowactions">' + actions.join("") + '</div>' +
        '</div>';
    }

    function actionButton(command, itemId, label) {
      return '<button class="ghost" data-command="' + command + '" data-item-id="' + escapeAttribute(itemId) + '">' + label + '</button>';
    }

    function countByStatus(items) {
      return items.reduce((counts, item) => {
        counts[item.status] = (counts[item.status] ?? 0) + 1;
        return counts;
      }, {});
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);
    }

    function escapeAttribute(value) {
      return escapeHtml(value);
    }
  </script>
</body>
</html>`;
  }
}

function serializeResult(result: CompareResult): {
  summary: CompareResult["summary"];
  items: WebviewResultItem[];
  elapsedMs: number;
} {
  return {
    summary: result.summary,
    elapsedMs: result.elapsedMs,
    items: result.items.map(serializeItem),
  };
}

function serializeItem(item: MatchResultItem): WebviewResultItem {
  const left = item.left ?? item.leftCandidates?.[0];
  const right = item.right ?? item.rightCandidates?.[0];
  return {
    id: item.id,
    status: item.status,
    label: item.displayKey,
    leftPath: item.left?.relativePath ?? candidateSummary(item.leftCandidates),
    rightPath: item.right?.relativePath ?? candidateSummary(item.rightCandidates),
    leftName: item.left?.fileName ?? (left ? `${left.fileName}${item.leftCandidates && item.leftCandidates.length > 1 ? ` +${item.leftCandidates.length - 1}` : ""}` : ""),
    rightName: item.right?.fileName ?? (right ? `${right.fileName}${item.rightCandidates && item.rightCandidates.length > 1 ? ` +${item.rightCandidates.length - 1}` : ""}` : ""),
    reason: item.reason,
    error: item.error ?? "",
    crossedType: Boolean(item.crossedType),
    canDiff: item.status === "paired-identical" || item.status === "paired-modified",
    canPick: item.status === "ambiguous",
    canForce: item.status === "left-only" || item.status === "right-only",
  };
}

function candidateSummary(candidates: MatchResultItem["leftCandidates"]): string {
  if (!candidates || candidates.length === 0) {
    return "";
  }
  return candidates.map((entry) => entry.relativePath).join(" | ");
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
