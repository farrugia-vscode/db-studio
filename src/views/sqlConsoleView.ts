import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connectionManager';
import type { ExtensionToConsole, ConsoleToExtension } from '../domain/consoleProtocol';

const STORAGE_PREFIX = 'dbStudio.console.';
const HISTORY_PREFIX = 'dbStudio.history.';
const MAX_AUTOCOMPLETE_TABLES = 300;
const MAX_HISTORY = 50;

/**
 * A per-connection SQL console: a full editor whose content is auto-saved to
 * global state, running statements against the connection and showing results.
 */
export class SqlConsoleView {
  private readonly panels = new Map<string, vscode.WebviewPanel>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly manager: ConnectionManager,
  ) {}

  open(connectionName: string): void {
    const existing = this.panels.get(connectionName);
    if (existing) {
      existing.reveal();
      return;
    }
    const mediaUri = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    const panel = vscode.window.createWebviewPanel(
      'dbStudio.console',
      `SQL · ${connectionName}`,
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [mediaUri] },
    );
    panel.webview.html = this.renderHtml(panel.webview, mediaUri);
    panel.webview.onDidReceiveMessage((message: ConsoleToExtension) => this.handleMessage(connectionName, panel, message));
    panel.onDidDispose(() => this.panels.delete(connectionName));
    this.panels.set(connectionName, panel);
  }

  private async handleMessage(
    connectionName: string,
    panel: vscode.WebviewPanel,
    message: ConsoleToExtension,
  ): Promise<void> {
    if (message.type === 'ready') {
      const sql = this.context.globalState.get<string>(STORAGE_PREFIX + connectionName, '');
      this.post(panel, { type: 'init', sql });
      this.post(panel, { type: 'history', items: this.loadHistory(connectionName) });
      void this.sendSchema(connectionName, panel);
      return;
    }
    if (message.type === 'save') {
      await this.context.globalState.update(STORAGE_PREFIX + connectionName, message.sql);
      return;
    }
    if (message.type === 'run') {
      await this.run(connectionName, panel, message.sql);
    }
  }

  private async run(connectionName: string, panel: vscode.WebviewPanel, sql: string): Promise<void> {
    if (sql.trim() === '') {
      return;
    }
    try {
      const driver = await this.manager.getDriver(connectionName);
      const result = await driver.query(sql);
      await this.pushHistory(connectionName, panel, sql);
      this.post(panel, {
        type: 'result',
        columns: result.columns,
        rows: result.rows.map((row) => result.columns.map((column) => formatCell(row[column]))),
        affectedRows: result.affectedRows,
      });
    } catch (error) {
      this.post(panel, {
        type: 'result',
        columns: [],
        rows: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private loadHistory(connectionName: string): string[] {
    return this.context.globalState.get<string[]>(HISTORY_PREFIX + connectionName, []);
  }

  /** Prepend a successfully run query to the connection's history (newest first, deduped). */
  private async pushHistory(connectionName: string, panel: vscode.WebviewPanel, sql: string): Promise<void> {
    const trimmed = sql.trim();
    if (trimmed === '') {
      return;
    }
    const history = this.loadHistory(connectionName).filter((entry) => entry !== trimmed);
    history.unshift(trimmed);
    const capped = history.slice(0, MAX_HISTORY);
    await this.context.globalState.update(HISTORY_PREFIX + connectionName, capped);
    this.post(panel, { type: 'history', items: capped });
  }

  /** Snapshot the default database's tables and columns so the editor can autocomplete. */
  private async sendSchema(connectionName: string, panel: vscode.WebviewPanel): Promise<void> {
    try {
      const driver = await this.manager.getDriver(connectionName);
      const configured = this.manager.getConnection(connectionName)?.database?.trim();
      const namespace = configured || (await driver.listNamespaces())[0];
      if (!namespace) {
        return;
      }
      const tableNames = await driver.listTables(namespace);
      // Cap the eager column fetch so a huge schema never stalls the console open.
      const capped = tableNames.slice(0, MAX_AUTOCOMPLETE_TABLES);
      const tables = await Promise.all(
        capped.map(async (name) => ({
          name,
          columns: (await driver.listColumns(namespace, name)).map((column) => column.name),
        })),
      );
      this.post(panel, { type: 'schema', tables });
    } catch {
      // Autocomplete is best-effort; a failure here must not break the console.
    }
  }

  private post(panel: vscode.WebviewPanel, message: ExtensionToConsole): void {
    panel.webview.postMessage(message);
  }

  private renderHtml(webview: vscode.Webview, mediaUri: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'console.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'console.css'));
    const nonce = buildNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link href="${styleUri}" rel="stylesheet">
</head>
<body>
  <div class="toolbar">
    <button id="run" class="primary">Run ▷</button>
    <button id="historyToggle" title="Recent queries">History ⌄</button>
    <span class="hint">Ctrl+Enter — run selection, or the whole script</span>
    <span id="status"></span>
  </div>
  <div id="editorWrap">
    <textarea id="editor" spellcheck="false" placeholder="SELECT * FROM …"></textarea>
    <ul id="autocomplete" class="autocomplete" hidden></ul>
    <div id="historyPanel" class="history" hidden>
      <div class="history-head">Recent queries<span id="historyEmpty" class="history-empty" hidden>— none yet</span></div>
      <ul id="historyList"></ul>
    </div>
  </div>
  <div id="resultWrap"><table id="result"></table></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function formatCell(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function buildNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
