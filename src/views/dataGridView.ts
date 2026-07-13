import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connectionManager';
import { EditFactory } from '../domain/edits/editFactory';
import type { DatabaseDriver } from '../domain/driver';
import type { ColumnMeta, Row } from '../domain/types';
import type { ExtensionToWebview, WebviewToExtension } from '../domain/gridProtocol';

export interface TableTarget {
  connectionName: string;
  namespace: string;
  table: string;
}

/**
 * Hosts the editable data grid for a single table. Loads rows + primary key,
 * and commits webview edits as parameterized statements built by each Edit
 * Command via the driver's dialect.
 */
export class DataGridView {
  private panel: vscode.WebviewPanel | null = null;
  private target: TableTarget | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly manager: ConnectionManager,
  ) {}

  async open(target: TableTarget): Promise<void> {
    this.target = target;
    if (!this.panel) {
      this.createPanel();
    }
    this.panel!.title = `${target.table} · ${target.connectionName}`;
    this.panel!.reveal();
    await this.reload();
  }

  private createPanel(): void {
    const mediaUri = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    this.panel = vscode.window.createWebviewPanel('dbStudio.dataGrid', 'Data', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [mediaUri],
    });
    this.panel.webview.html = this.renderHtml(this.panel.webview, mediaUri);
    this.panel.webview.onDidReceiveMessage((message: WebviewToExtension) => this.handleMessage(message));
    this.panel.onDidDispose(() => {
      this.panel = null;
    });
  }

  private async handleMessage(message: WebviewToExtension): Promise<void> {
    if (message.type === 'ready' || message.type === 'reload') {
      await this.reload();
      return;
    }
    if (message.type === 'commit') {
      await this.commit(message.edits.map((dto) => EditFactory.fromDto(dto)));
    }
  }

  private async reload(): Promise<void> {
    if (!this.target) {
      return;
    }
    try {
      const driver = await this.manager.getDriver(this.target.connectionName);
      const columns = await driver.listColumns(this.target.namespace, this.target.table);
      const pkColumns = columns.filter((column) => column.isPrimaryKey).map((column) => column.name);
      const ref = driver.buildTableRef(this.target.namespace, this.target.table);
      const limit = vscode.workspace.getConfiguration('dbStudio').get<number>('rowLimit', 200);
      const result = await driver.query(`SELECT * FROM ${ref} LIMIT ${limit}`);
      this.post({
        type: 'data',
        table: this.target.table,
        columns,
        pkColumns,
        rows: result.rows.map((row) => normalizeRow(row, columns)),
      });
    } catch (error) {
      this.reportError(error);
    }
  }

  private async commit(edits: ReturnType<typeof EditFactory.fromDto>[]): Promise<void> {
    if (!this.target) {
      return;
    }
    try {
      const driver = await this.manager.getDriver(this.target.connectionName);
      const ref = driver.buildTableRef(this.target.namespace, this.target.table);
      const applied = await this.applyEdits(driver, ref, edits);
      vscode.window.showInformationMessage(`DB Studio: ${applied} change(s) committed.`);
      await this.reload();
    } catch (error) {
      this.reportError(error);
    }
  }

  private async applyEdits(
    driver: DatabaseDriver,
    tableRef: string,
    edits: ReturnType<typeof EditFactory.fromDto>[],
  ): Promise<number> {
    let applied = 0;
    for (const edit of edits) {
      const statement = edit.toStatement(driver, tableRef);
      await driver.runWrite(statement.sql, statement.params);
      applied += 1;
    }
    return applied;
  }

  private reportError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`DB Studio: ${message}`);
    this.post({ type: 'error', message });
  }

  private post(message: ExtensionToWebview): void {
    this.panel?.webview.postMessage(message);
  }

  private renderHtml(webview: vscode.Webview, mediaUri: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'grid.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'grid.css'));
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
    <button id="addRow">+ Row</button>
    <button id="commit" class="primary" disabled>Commit</button>
    <button id="revert" disabled>Revert</button>
    <button id="reload">Reload</button>
    <span id="status"></span>
  </div>
  <div id="notice" class="notice"></div>
  <div id="gridWrap"><table id="grid"></table></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/**
 * Coerces driver-specific values (Date, Buffer, objects) into plain strings the
 * webview can render and edit; null stays null so it can be shown as NULL.
 */
function normalizeRow(row: Row, columns: ColumnMeta[]): Row {
  const normalized: Row = {};
  for (const column of columns) {
    const value = row[column.name];
    if (value === null || value === undefined) {
      normalized[column.name] = null;
    } else if (value instanceof Date) {
      normalized[column.name] = value.toISOString();
    } else if (typeof value === 'object') {
      normalized[column.name] = JSON.stringify(value);
    } else {
      normalized[column.name] = String(value);
    }
  }
  return normalized;
}

function buildNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
