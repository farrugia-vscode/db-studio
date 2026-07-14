import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connectionManager';
import type { ColumnDraft, ColumnMeta } from '../domain/types';
import type { DesignerToExtension, ExtensionToDesigner } from '../domain/designerProtocol';

export interface DesignerTarget {
  connectionName: string;
  namespace: string;
  /** Undefined → create a new table; set → modify that table. */
  table?: string;
}

/**
 * Structural editor to create a table or modify an existing one: edits the
 * column list, previews the generated CREATE / ALTER SQL, and applies it after
 * confirmation.
 */
export class TableDesignerView {
  private panel: vscode.WebviewPanel | null = null;
  private target: DesignerTarget | null = null;
  private original: ColumnMeta[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly manager: ConnectionManager,
    private readonly onApplied: () => void,
  ) {}

  async open(target: DesignerTarget): Promise<void> {
    this.target = target;
    this.original = [];
    if (!this.panel) {
      this.createPanel();
    }
    this.panel!.title = target.table ? `Modify ${target.table}` : `New table · ${target.namespace}`;
    this.panel!.reveal();
    await this.postInit();
  }

  private createPanel(): void {
    const mediaUri = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    this.panel = vscode.window.createWebviewPanel('dbStudio.designer', 'Table Designer', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [mediaUri],
    });
    this.panel.webview.html = this.renderHtml(this.panel.webview, mediaUri);
    this.panel.webview.onDidReceiveMessage((message: DesignerToExtension) => this.handleMessage(message));
    this.panel.onDidDispose(() => {
      this.panel = null;
      this.target = null;
    });
  }

  private async postInit(): Promise<void> {
    if (!this.target) {
      return;
    }
    try {
      let columns: ColumnDraft[] = [];
      if (this.target.table) {
        const driver = await this.manager.getDriver(this.target.connectionName);
        this.original = await driver.listColumns(this.target.namespace, this.target.table);
        columns = this.original.map((column) => ({
          originalName: column.name,
          name: column.name,
          type: column.type,
          isNullable: column.isNullable,
          isPrimaryKey: column.isPrimaryKey,
          isAutoIncrement: column.isAutoIncrement,
          defaultValue: column.defaultValue,
          drop: false,
        }));
      }
      const driver = this.manager.getConnection(this.target.connectionName)?.driver ?? 'mysql';
      this.post({
        type: 'init',
        mode: this.target.table ? 'modify' : 'create',
        driver,
        table: this.target.table ?? '',
        columns,
      });
    } catch (error) {
      this.reportError(error);
    }
  }

  private async handleMessage(message: DesignerToExtension): Promise<void> {
    if (message.type === 'ready') {
      await this.postInit();
      return;
    }
    if (message.type === 'preview') {
      await this.preview(message.table, message.columns);
      return;
    }
    if (message.type === 'apply') {
      await this.apply(message.table, message.columns);
    }
  }

  private async buildStatements(table: string, columns: ColumnDraft[]): Promise<string[]> {
    const driver = await this.manager.getDriver(this.target!.connectionName);
    if (this.target!.table) {
      return driver.buildAlterTable(this.target!.namespace, this.target!.table, this.original, columns);
    }
    return [driver.buildCreateTable(this.target!.namespace, table, columns)];
  }

  private async preview(table: string, columns: ColumnDraft[]): Promise<void> {
    try {
      const statements = await this.buildStatements(table, columns);
      this.post({ type: 'sql', sql: statements.join('\n') || '-- No changes' });
    } catch (error) {
      this.reportError(error);
    }
  }

  private async apply(table: string, columns: ColumnDraft[]): Promise<void> {
    try {
      const statements = await this.buildStatements(table, columns);
      if (statements.length === 0) {
        vscode.window.showInformationMessage('DB Studio: nothing to apply.');
        return;
      }
      const confirmed = await vscode.window.showWarningMessage(
        `Apply ${statements.length} statement(s) to the database?`,
        { modal: true, detail: statements.join('\n') },
        'Apply',
      );
      if (confirmed !== 'Apply') {
        return;
      }
      const driver = await this.manager.getDriver(this.target!.connectionName);
      for (const statement of statements) {
        await driver.query(statement);
      }
      vscode.window.showInformationMessage('DB Studio: changes applied.');
      this.onApplied();
      this.panel?.dispose();
    } catch (error) {
      this.reportError(error);
    }
  }

  private reportError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`DB Studio: ${message}`);
    this.post({ type: 'error', message });
  }

  private post(message: ExtensionToDesigner): void {
    this.panel?.webview.postMessage(message);
  }

  private renderHtml(webview: vscode.Webview, mediaUri: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'designer.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'designer.css'));
    const nonce = buildNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link href="${styleUri}" rel="stylesheet">
</head>
<body>
  <div class="bar">
    <label id="tableNameWrap">Table name <input id="tableName" spellcheck="false"></label>
    <span class="spacer"></span>
    <button id="apply" class="primary" disabled>Apply</button>
  </div>
  <div id="notice" class="notice"></div>
  <div id="content">
    <table id="columns">
      <thead>
        <tr>
          <th></th><th>Name</th><th>Type</th><th>Size</th><th>Null</th><th>PK</th><th>Auto</th><th>Default</th>
        </tr>
      </thead>
      <tbody id="columnsBody"></tbody>
    </table>
    <button id="addColumn">+ Add column</button>
    <div id="sqlPane">
      <div class="sql-title">Generated SQL</div>
      <pre id="sql" class="sql"></pre>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function buildNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
