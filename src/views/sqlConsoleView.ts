import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connectionManager';
import { QueryHistory } from './queryHistory';
import { getConnectionIcon } from './connectionIcon';
import { isReadStatement, splitSqlStatements, statementLabel } from '../domain/sqlScript';
import type {
  ConsoleCellEdit,
  ConsoleEditableTable,
  ConsoleResult,
  ConsoleResultColumn,
  ConsoleToExtension,
  ExtensionToConsole,
} from '../domain/consoleProtocol';
import type { ColumnSource } from '../domain/types';

const STORAGE_PREFIX = 'dbStudio.console.';
const MAX_AUTOCOMPLETE_TABLES = 300;

// A small download arrow, marking the CSV/MD buttons as exports.
const EXPORT_ARROW =
  '<svg class="btn-icon" viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.5v7"/><path d="M4.5 6 8 9.5 11.5 6"/><path d="M3 12.5h10"/></svg>';

// A small trash can, marking the "Empty" button as a clear action.
const TRASH_ICON =
  '<svg class="btn-icon" viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5h10"/><path d="M5.5 4.5V3h5v1.5"/><path d="M4.5 4.5 5 13h6l.5-8.5"/></svg>';

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
    panel.iconPath = getConnectionIcon(this.manager.getConnection(connectionName));
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
      return;
    }
    if (message.type === 'exportHistory') {
      await this.exportHistory(connectionName, message.format, message.content, message.count);
      return;
    }
    if (message.type === 'clearHistory') {
      await this.clearHistory(connectionName, panel);
      return;
    }
    if (message.type === 'updateCells') {
      await this.updateCells(connectionName, panel, message.namespace, message.edits);
    }
  }

  private async clearHistory(connectionName: string, panel: vscode.WebviewPanel): Promise<void> {
    if (this.history.list(connectionName).length === 0) {
      return;
    }
    const confirmed = await vscode.window.showWarningMessage(
      `Clear the query history for "${connectionName}"? This cannot be undone.`,
      { modal: true },
      'Clear',
    );
    if (confirmed !== 'Clear') {
      return;
    }
    await this.history.clear(connectionName);
    this.post(panel, { type: 'history', items: [] });
  }

  private async exportHistory(
    connectionName: string,
    format: 'csv' | 'markdown',
    content: string,
    count: number,
  ): Promise<void> {
    const extension = format === 'csv' ? 'csv' : 'md';
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`${connectionName}-history.${extension}`),
      filters: { [format.toUpperCase()]: [extension] },
    });
    if (!uri) {
      return;
    }
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    vscode.window.showInformationMessage(`DB Studio: exported ${count} quer${count === 1 ? 'y' : 'ies'} to ${uri.fsPath}`);
  }

  private async sendInit(connectionName: string, panel: vscode.WebviewPanel): Promise<void> {
    const sql = this.context.workspaceState.get<string>(STORAGE_PREFIX + connectionName, '');
    const namespaces = await this.listNamespaces(connectionName);
    const configured = this.manager.getConnection(connectionName)?.database?.trim();
    const preselected = this.preselected.get(connectionName);
    const namespace = pickNamespace(namespaces, preselected ?? configured);
    const driver = this.manager.getConnection(connectionName)?.driver ?? 'mysql';
    this.post(panel, { type: 'init', sql, namespaces, namespace, driver });
    this.post(panel, { type: 'history', items: this.history.list(connectionName) });
    void this.sendSchema(connectionName, panel, namespace);
  }

  // A result column is editable when its source table's FULL primary key is also in the result
  // (so an UPDATE can target exactly one row) — PK columns themselves stay read-only.
  private async computeEditability(
    connectionName: string,
    namespace: string,
    fields: ColumnSource[],
  ): Promise<{ columnsMeta: ConsoleResultColumn[]; editableTables: ConsoleEditableTable[] }> {
    const driver = await this.manager.getDriver(connectionName);
    const tables = [...new Set(fields.map((field) => field.sourceTable).filter((table): table is string => !!table))];
    const editableTables: ConsoleEditableTable[] = [];
    const pkByTable = new Map<string, string[]>();
    for (const table of tables) {
      let pkColumns: string[] = [];
      try {
        const columns = await driver.listColumns(namespace, table);
        pkColumns = columns.filter((column) => column.isPrimaryKey).map((column) => column.name);
      } catch {
        continue; // table not reachable in this schema → leave it read-only
      }
      if (pkColumns.length === 0) {
        continue;
      }
      const pkIndexes = pkColumns.map((pk) =>
        fields.findIndex((field) => field.sourceTable === table && field.sourceColumn === pk),
      );
      if (pkIndexes.every((index) => index >= 0)) {
        editableTables.push({ table, pkColumns, pkIndexes });
        pkByTable.set(table, pkColumns);
      }
    }
    const columnsMeta: ConsoleResultColumn[] = fields.map((field) => ({
      name: field.name,
      sourceTable: field.sourceTable,
      sourceColumn: field.sourceColumn,
      editable:
        !!field.sourceTable &&
        !!field.sourceColumn &&
        pkByTable.has(field.sourceTable) &&
        !pkByTable.get(field.sourceTable)!.includes(field.sourceColumn),
    }));
    return { columnsMeta, editableTables };
  }

  private async updateCells(
    connectionName: string,
    panel: vscode.WebviewPanel,
    namespace: string,
    edits: ConsoleCellEdit[],
  ): Promise<void> {
    if (edits.length === 0) {
      return;
    }
    if (this.isReadOnly(connectionName)) {
      this.post(panel, { type: 'updateResult', count: 0, error: 'This connection is read-only.' });
      return;
    }
    try {
      const driver = await this.manager.getDriver(connectionName);
      await driver.beginTransaction();
      try {
        for (const edit of edits) {
          const ref = driver.buildTableRef(namespace, edit.table);
          const setClause = `${driver.quoteIdentifier(edit.column)} = ${driver.placeholder(1)}`;
          const whereClause = edit.pk
            .map((part, index) => `${driver.quoteIdentifier(part.column)} = ${driver.placeholder(index + 2)}`)
            .join(' AND ');
          const params = [edit.value, ...edit.pk.map((part) => part.value)];
          await driver.runWrite(`UPDATE ${ref} SET ${setClause} WHERE ${whereClause}`, params);
        }
        await driver.commitTransaction();
      } catch (error) {
        await driver.rollbackTransaction();
        throw error;
      }
      this.post(panel, { type: 'updateResult', count: edits.length });
    } catch (error) {
      this.post(panel, {
        type: 'updateResult',
        count: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private isReadOnly(connectionName: string): boolean {
    return this.manager.getConnection(connectionName)?.isReadOnly ?? false;
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
    const statements = splitSqlStatements(sql);
    const driver = await this.manager.getDriver(connectionName);
    if (namespace) {
      try {
        await driver.useNamespace(namespace);
      } catch {
        // A bad schema shouldn't abort the whole run; the statements will surface their own errors.
      }
    }
    // Each `;`-separated statement runs independently and produces its own result tab.
    const results: ConsoleResult[] = [];
    for (const statement of statements) {
      results.push(await this.runStatement(connectionName, namespace, statement));
    }
    this.post(panel, { type: 'results', results });
  }

  private async runStatement(connectionName: string, namespace: string, statement: string): Promise<ConsoleResult> {
    const label = statementLabel(statement);
    if (this.isReadOnly(connectionName) && !isReadStatement(statement)) {
      return { label, columns: [], rows: [], error: 'Read-only connection: only read queries are allowed.' };
    }
    try {
      const driver = await this.manager.getDriver(connectionName);
      const result = await driver.query(statement);
      const meta =
        result.columns.length > 0 ? { rowCount: result.rows.length } : { affectedRows: result.affectedRows };
      void this.history.push(connectionName, statement, meta);
      const editability =
        result.fields && !this.isReadOnly(connectionName)
          ? await this.computeEditability(connectionName, namespace, result.fields)
          : undefined;
      return {
        label,
        columns: result.columns,
        rows: result.rows.map((row) => result.columns.map((column) => formatCell(row[column]))),
        affectedRows: result.affectedRows,
        columnsMeta: editability?.columnsMeta,
        editableTables: editability?.editableTables,
      };
    } catch (error) {
      return { label, columns: [], rows: [], error: error instanceof Error ? error.message : String(error) };
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
    <button id="run" class="primary" title="Run (Ctrl+Enter)">Run ▷</button>
    <button id="format" title="Format SQL (Alt+Shift+F)">Format</button>
    <button id="historyToggle" title="Recent queries" aria-pressed="false">History</button>
    <span class="hint">Ctrl+Enter — run selection, or the whole script</span>
    <span id="syntaxHint" class="syntax-hint" hidden></span>
    <span id="status"></span>
    <span class="schema-picker" title="Schema queries run against">Schema
      <select id="schema"></select>
    </span>
  </div>
  <div id="belowToolbar">
    <div id="workspace">
      <div id="editorWrap">
        <pre id="highlight" aria-hidden="true"><code id="highlightCode"></code></pre>
        <textarea id="editor" spellcheck="false" placeholder="SELECT * FROM …"></textarea>
        <ul id="autocomplete" class="autocomplete" hidden></ul>
      </div>
      <div id="editorResizer" class="editor-resizer" title="Drag to resize the editor"></div>
      <div id="editBar" class="edit-bar" hidden>
        <span id="editCount"></span>
        <button id="editSqlToggle" class="edit-sql-toggle" aria-pressed="false" title="Show the SQL that Commit will run">Show SQL</button>
        <span class="edit-bar-spacer"></span>
        <button id="editRevert">Revert</button>
        <button id="editCommit" class="primary">Commit</button>
      </div>
      <pre id="editSql" class="edit-sql" hidden></pre>
      <div id="resultTabs" class="result-tabs" hidden></div>
      <div id="resultWrap"><table id="result"></table></div>
      <div id="resultFooter" class="result-footer" hidden></div>
    </div>
    <aside id="historyPanel" class="history" hidden aria-label="Query history">
      <div class="history-head">
        <span>Recent queries<span id="historyCount" class="history-count"></span><span id="historyEmpty" class="history-empty" hidden>— none yet</span></span>
        <button id="historyClose" class="history-close" title="Close history" aria-label="Close history">×</button>
      </div>
      <div class="history-tools">
        <input id="historyFilter" type="search" placeholder="Filter queries…" spellcheck="false" aria-label="Filter queries">
        <button id="historyExportCsv" title="Export history as CSV">${EXPORT_ARROW}CSV</button>
        <button id="historyExportMd" title="Export history as Markdown">${EXPORT_ARROW}MD</button>
        <button id="historyClear" class="history-clear" title="Clear all history">${TRASH_ICON}Empty</button>
      </div>
      <ul id="historyList"></ul>
    </aside>
  </div>
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
