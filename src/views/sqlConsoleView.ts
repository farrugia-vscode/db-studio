import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connectionManager';
import { QueryHistory } from './queryHistory';
import type { ExtensionToConsole, ConsoleToExtension } from '../domain/consoleProtocol';

const STORAGE_PREFIX = 'dbStudio.console.';
const MAX_AUTOCOMPLETE_TABLES = 300;

/**
 * A per-connection SQL console: a full editor whose content is auto-saved to
 * global state, running statements against the connection and showing results.
 */
export class SqlConsoleView {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  // Schema to preselect on first open (when launched from a schema node).
  private readonly preselected = new Map<string, string>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly manager: ConnectionManager,
    private readonly history: QueryHistory,
  ) {}

  open(connectionName: string, namespace?: string): void {
    const existing = this.panels.get(connectionName);
    if (existing) {
      existing.reveal();
      // Launching again from a schema node preselects it in the open console.
      if (namespace) {
        this.post(existing, { type: 'selectSchema', namespace });
      }
      return;
    }
    if (namespace) {
      this.preselected.set(connectionName, namespace);
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
    panel.onDidDispose(() => {
      this.panels.delete(connectionName);
      this.preselected.delete(connectionName);
    });
    this.panels.set(connectionName, panel);
  }

  private async handleMessage(
    connectionName: string,
    panel: vscode.WebviewPanel,
    message: ConsoleToExtension,
  ): Promise<void> {
    if (message.type === 'ready') {
      await this.sendInit(connectionName, panel);
      return;
    }
    if (message.type === 'save') {
      await this.context.workspaceState.update(STORAGE_PREFIX + connectionName, message.sql);
      return;
    }
    if (message.type === 'schemaChange') {
      void this.sendSchema(connectionName, panel, message.namespace);
      return;
    }
    if (message.type === 'run') {
      await this.run(connectionName, panel, message.sql, message.namespace);
    }
  }

  private async sendInit(connectionName: string, panel: vscode.WebviewPanel): Promise<void> {
    const sql = this.context.workspaceState.get<string>(STORAGE_PREFIX + connectionName, '');
    const namespaces = await this.listNamespaces(connectionName);
    const configured = this.manager.getConnection(connectionName)?.database?.trim();
    const preselected = this.preselected.get(connectionName);
    const namespace = pickNamespace(namespaces, preselected ?? configured);
    this.post(panel, { type: 'init', sql, namespaces, namespace });
    this.post(panel, { type: 'history', items: this.history.list(connectionName) });
    void this.sendSchema(connectionName, panel, namespace);
  }

  private async listNamespaces(connectionName: string): Promise<string[]> {
    try {
      const driver = await this.manager.getDriver(connectionName);
      return await driver.listNamespaces();
    } catch {
      return [];
    }
  }

  private async run(connectionName: string, panel: vscode.WebviewPanel, sql: string, namespace: string): Promise<void> {
    if (sql.trim() === '') {
      return;
    }
    try {
      const driver = await this.manager.getDriver(connectionName);
      if (namespace) {
        await driver.useNamespace(namespace);
      }
      const result = await driver.query(sql);
      this.post(panel, { type: 'history', items: await this.history.push(connectionName, sql) });
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

  /** Snapshot a schema's tables and columns so the editor can autocomplete. */
  private async sendSchema(connectionName: string, panel: vscode.WebviewPanel, namespace: string): Promise<void> {
    try {
      const driver = await this.manager.getDriver(connectionName);
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
    const baseStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'base.css'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'console.css'));
    const nonce = buildNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link href="${baseStyleUri}" rel="stylesheet">
<link href="${styleUri}" rel="stylesheet">
</head>
<body class="stacked">
  <div class="toolbar">
    <button id="run" class="primary">Run ▷</button>
    <button id="historyToggle" title="Recent queries">History ⌄</button>
    <span class="hint">Ctrl+Enter — run selection, or the whole script</span>
    <span id="status"></span>
    <span class="schema-picker" title="Schema queries run against">Schema
      <select id="schema"></select>
    </span>
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

// The preferred schema if it exists, else the first available.
function pickNamespace(namespaces: string[], preferred?: string): string {
  if (preferred && namespaces.includes(preferred)) {
    return preferred;
  }
  return namespaces[0] ?? '';
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
