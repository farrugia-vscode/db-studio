import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connectionManager';
import type { ExtensionToConsole, ConsoleToExtension } from '../domain/consoleProtocol';

const STORAGE_PREFIX = 'dbStudio.console.';

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
    <span class="hint">Ctrl+Enter — run selection, or the whole script</span>
    <span id="status"></span>
  </div>
  <textarea id="editor" spellcheck="false" placeholder="SELECT * FROM …"></textarea>
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
