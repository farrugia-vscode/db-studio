import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connectionManager';
import { EditFactory } from '../domain/edits/editFactory';
import { QueryHistory } from './queryHistory';
import { getConnectionIcon } from './connectionIcon';
import type { ColumnMeta, IndexMeta, Row } from '../domain/types';
import type { CopyFormat, CopyMessage, ExportMessage, ExtensionToWebview, WebviewToExtension } from '../domain/gridProtocol';
import type { EditDto } from '../domain/edits/edit';
import { csvCell, sqlLiteral } from '../domain/exportFormat';

export interface TableTarget {
  connectionName: string;
  namespace: string;
  table: string;
}

function keyOf(target: TableTarget): string {
  return `${target.connectionName}\0${target.namespace}\0${target.table}`;
}

/**
 * Opens each table in its own editor tab and tracks one {@link GridSession} per
 * open table, so opening another table never replaces the previous one.
 */
export class DataGridView {
  private readonly sessions = new Map<string, GridSession>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly manager: ConnectionManager,
    private readonly history: QueryHistory,
  ) {}

  async open(target: TableTarget, initialFilter = ''): Promise<void> {
    const key = keyOf(target);
    const existing = this.sessions.get(key);
    if (existing) {
      existing.reveal();
      // Navigating to an already-open table applies the new filter (e.g. an FK jump).
      if (initialFilter) {
        await existing.applyFilter(initialFilter);
      }
      return;
    }
    const panel = this.createPanel(target);
    const session = new GridSession(panel, this.manager, this.history, target, initialFilter, (relatedTarget, relatedFilter) =>
      this.open(relatedTarget, relatedFilter),
    );
    this.sessions.set(key, session);
    panel.onDidDispose(() => this.sessions.delete(key));
    await session.load();
  }

  private createPanel(target: TableTarget): vscode.WebviewPanel {
    const mediaUri = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    const panel = vscode.window.createWebviewPanel(
      'dbStudio.dataGrid',
      `${target.table} · ${target.connectionName}`,
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [mediaUri] },
    );
    panel.iconPath = getConnectionIcon(this.manager.getConnection(target.connectionName));
    panel.webview.html = renderHtml(panel.webview, mediaUri);
    return panel;
  }
}

/** A single table's live grid: owns its panel, filter and pagination state. */
class GridSession {
  private filter: string;
  private offset = 0;
  private pageSize = 100;
  private orderBy = '';

  constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly manager: ConnectionManager,
    private readonly history: QueryHistory,
    private readonly target: TableTarget,
    initialFilter: string,
    private readonly openRelated: (target: TableTarget, filter: string) => Promise<void>,
  ) {
    this.filter = initialFilter;
    this.panel.webview.onDidReceiveMessage((message: WebviewToExtension) => this.handleMessage(message));
  }

  reveal(): void {
    this.panel.reveal();
  }

  async applyFilter(filter: string): Promise<void> {
    this.filter = filter;
    this.offset = 0;
    await this.reload();
  }

  async load(): Promise<void> {
    await this.reload();
  }

  private async handleMessage(message: WebviewToExtension): Promise<void> {
    if (message.type === 'ready' || message.type === 'reload') {
      await this.reload();
      return;
    }
    if (message.type === 'filter') {
      this.filter = message.value;
      this.offset = 0;
      await this.reload();
      return;
    }
    if (message.type === 'page') {
      this.offset = Math.max(0, message.offset);
      this.pageSize = Math.max(0, message.pageSize);
      await this.reload();
      return;
    }
    if (message.type === 'sort') {
      const driver = await this.manager.getDriver(this.target.connectionName);
      this.orderBy = message.column ? `${driver.quoteIdentifier(message.column)} ${message.direction}` : '';
      this.offset = 0;
      await this.reload();
      return;
    }
    if (message.type === 'order') {
      this.orderBy = message.orderBy;
      this.offset = 0;
      await this.reload();
      return;
    }
    if (message.type === 'copy') {
      await this.copy(message);
      return;
    }
    if (message.type === 'export') {
      await this.export(message);
      return;
    }
    if (message.type === 'fkValues') {
      await this.sendFkValues(message.requestId, message.refTable, message.refColumn, message.search);
      return;
    }
    if (message.type === 'openRelated') {
      await this.openRelated(
        { connectionName: this.target.connectionName, namespace: message.namespace, table: message.table },
        this.buildFilter(await this.manager.getDriver(this.target.connectionName), message.columns, message.values),
      );
      return;
    }
    if (message.type === 'previewEdits') {
      await this.previewEdits(message.edits);
      return;
    }
    if (message.type === 'commit') {
      await this.commit(message.edits.map((dto) => EditFactory.fromDto(dto)));
    }
  }

  /** Render the pending edits as the real SQL (params inlined) for the review drawer. */
  private async previewEdits(dtos: EditDto[]): Promise<void> {
    try {
      const driver = await this.manager.getDriver(this.target.connectionName);
      const ref = driver.buildTableRef(this.target.namespace, this.target.table);
      const statements = dtos.map((dto) => {
        const statement = EditFactory.fromDto(dto).toStatement(driver, ref);
        return inlineParams(statement.sql, statement.params);
      });
      this.post({ type: 'editsPreview', statements });
    } catch (error) {
      this.reportError(error);
    }
  }

  /** The first distinct values of a referenced column, feeding an FK cell dropdown. */
  private async sendFkValues(requestId: number, refTable: string, refColumn: string, search?: string): Promise<void> {
    try {
      const driver = await this.manager.getDriver(this.target.connectionName);
      const ref = driver.buildTableRef(this.target.namespace, refTable);
      const col = driver.quoteIdentifier(refColumn);
      const [columns, indexes] = await Promise.all([
        driver.listColumns(this.target.namespace, refTable),
        driver.listIndexes(this.target.namespace, refTable),
      ]);
      const displayColumn = pickDisplayColumn(columns, indexes, refColumn);
      const labelCol = displayColumn ? driver.quoteIdentifier(displayColumn) : null;
      const selectLabel = labelCol ? `, ${labelCol} AS label` : '';
      // Search matches the key or the label; limit + 1 so we can tell the user more exist.
      const term = (search ?? '').trim();
      const where = this.fkSearchClause(col, labelCol, term);
      const limit = FK_LIMIT;
      // Order by the key column: it is indexed (usually the PK), so this stays fast even on large
      // referenced tables — ordering by the label could full-scan/sort and hang the dropdown.
      const result = await driver.query(
        `SELECT ${col} AS value${selectLabel} FROM ${ref} WHERE ${col} IS NOT NULL${where} ORDER BY ${col} LIMIT ${limit + 1}`,
      );
      const rows = result.rows.slice(0, limit);
      const options = rows.map((row) => ({
        value: String(row.value),
        label: row.label === null || row.label === undefined ? null : String(row.label),
      }));
      this.post({ type: 'fkValuesResult', requestId, options, hasMore: result.rows.length > limit });
    } catch (error) {
      // Still resolve the dropdown (so it stops loading) and surface the error in the notice bar.
      this.post({ type: 'fkValuesResult', requestId, options: [], hasMore: false });
      this.reportError(error);
    }
  }

  private fkSearchClause(keyCol: string, labelCol: string | null, term: string): string {
    if (term === '') {
      return '';
    }
    const like = sqlLiteral(`%${term}%`);
    const conditions = [`${keyCol} LIKE ${like}`];
    if (labelCol) {
      conditions.push(`${labelCol} LIKE ${like}`);
    }
    return ` AND (${conditions.join(' OR ')})`;
  }

  /** Builds a `col = value AND …` condition (NULL-safe) for foreign-key navigation. */
  private buildFilter(
    driver: Awaited<ReturnType<ConnectionManager['getDriver']>>,
    columns: string[],
    values: Array<string | null>,
  ): string {
    return columns
      .map((column, index) => {
        const value = values[index];
        const quoted = driver.quoteIdentifier(column);
        return value === null ? `${quoted} IS NULL` : `${quoted} = ${sqlLiteral(value)}`;
      })
      .join(' AND ');
  }

  private async copy(message: CopyMessage): Promise<void> {
    await vscode.env.clipboard.writeText(await this.formatContent(message));
  }

  private async export(message: ExportMessage): Promise<void> {
    const content = await this.formatContent(message);
    const extension = EXPORT_EXTENSIONS[message.format];
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`${this.target.table}.${extension}`),
      filters: { [message.format.toUpperCase()]: [extension] },
    });
    if (!uri) {
      return;
    }
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    vscode.window.showInformationMessage(`DB Studio: exported ${message.rows.length} row(s) to ${uri.fsPath}`);
  }

  private async formatContent(message: CopyMessage | ExportMessage): Promise<string> {
    return message.format === 'insert' ? this.toInsert(message) : formatCopy(message);
  }

  private async toInsert(message: CopyMessage | ExportMessage): Promise<string> {
    const driver = await this.manager.getDriver(this.target.connectionName);
    const ref = driver.buildTableRef(this.target.namespace, this.target.table);
    const cols = message.columns.map((column) => driver.quoteIdentifier(column)).join(', ');
    return message.rows
      .map((row) => `INSERT INTO ${ref} (${cols}) VALUES (${row.map(sqlLiteral).join(', ')});`)
      .join('\n');
  }

  private async reload(): Promise<void> {
    try {
      const driver = await this.manager.getDriver(this.target.connectionName);
      const [columns, foreignKeys, incomingForeignKeys, indexes] = await Promise.all([
        driver.listColumns(this.target.namespace, this.target.table),
        driver.listForeignKeys(this.target.namespace, this.target.table),
        driver.listIncomingForeignKeys(this.target.namespace, this.target.table),
        driver.listIndexes(this.target.namespace, this.target.table),
      ]);
      const pkColumns = columns.filter((column) => column.isPrimaryKey).map((column) => column.name);
      const indexedColumns = [...new Set(indexes.flatMap((index) => index.columns))];
      const ref = driver.buildTableRef(this.target.namespace, this.target.table);

      // The filter is a raw SQL condition (PHPStorm-style), used as the WHERE clause.
      const where = this.filter.trim() ? `WHERE ${this.filter}` : '';

      const countResult = await driver.query(`SELECT COUNT(*) AS total FROM ${ref} ${where}`);
      const total = Number(countResult.rows[0]?.total ?? 0);

      const paged = this.pageSize > 0;
      this.offset = paged && total > 0 ? Math.min(this.offset, Math.floor((total - 1) / this.pageSize) * this.pageSize) : 0;
      const limitClause = paged ? `LIMIT ${this.pageSize} OFFSET ${this.offset}` : '';
      // ORDER BY is a raw clause (header sort builds a quoted one; the box lets the user type any).
      const orderClause = this.orderBy.trim() ? `ORDER BY ${this.orderBy}` : '';

      const result = await driver.query(`SELECT * FROM ${ref} ${where} ${orderClause} ${limitClause}`);
      // Log the logical query (no pagination) so paging doesn't flood the shared history.
      void this.history.push(this.target.connectionName, `SELECT * FROM ${ref} ${where} ${orderClause}`.trim(), {
        rowCount: total,
      });
      this.post({
        type: 'data',
        namespace: this.target.namespace,
        table: this.target.table,
        columns,
        pkColumns,
        foreignKeys,
        incomingForeignKeys,
        indexedColumns,
        readOnly: this.isReadOnly(),
        rows: result.rows.map((row) => normalizeRow(row, columns)),
        total,
        offset: this.offset,
        pageSize: this.pageSize,
        filter: this.filter,
        orderBy: this.orderBy,
        dateLocale: vscode.workspace.getConfiguration('dbStudio').get<string>('dateLocale', ''),
      });
    } catch (error) {
      this.reportError(error);
    }
  }

  private isReadOnly(): boolean {
    return this.manager.getConnection(this.target.connectionName)?.isReadOnly ?? false;
  }

  private async commit(edits: ReturnType<typeof EditFactory.fromDto>[]): Promise<void> {
    if (this.isReadOnly()) {
      this.reportError(new Error('This connection is read-only; changes were not committed.'));
      return;
    }
    try {
      const driver = await this.manager.getDriver(this.target.connectionName);
      const ref = driver.buildTableRef(this.target.namespace, this.target.table);
      let applied = 0;
      await driver.beginTransaction();
      try {
        for (const edit of edits) {
          const statement = edit.toStatement(driver, ref);
          const affectedRows = await driver.runWrite(statement.sql, statement.params);
          void this.history.push(this.target.connectionName, statement.sql, { affectedRows });
          applied += 1;
        }
        await driver.commitTransaction();
      } catch (error) {
        await driver.rollbackTransaction();
        throw error;
      }
      vscode.window.showInformationMessage(`DB Studio: ${applied} change(s) committed.`);
      await this.reload();
    } catch (error) {
      this.reportError(error);
    }
  }

  private reportError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`DB Studio: ${message}`);
    this.post({ type: 'error', message });
  }

  private post(message: ExtensionToWebview): void {
    this.panel.webview.postMessage(message);
  }
}

/** Inline stroke icons (theme-aware via currentColor; CSP-safe, no font/asset needed). */
function icon(paths: string): string {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

const ICONS = {
  commit: icon('<path d="M13.5 4.5 6.5 12 3 8.5"/>'),
  revert: icon('<path d="M6 4 3 7l3 3"/><path d="M3 7h6.5a3.5 3.5 0 0 1 0 7H8"/>'),
  columns: icon('<rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M6.2 3v10M9.8 3v10"/>'),
  export: icon('<path d="M8 2.5v7"/><path d="M4.5 6 8 9.5 11.5 6"/><path d="M3 12.5h10"/>'),
  reload: icon('<path d="M12.8 8a4.8 4.8 0 1 1-1.4-3.4"/><path d="M13 3v2.6h-2.6"/>'),
  undo: icon('<path d="M3 8h7a3.2 3.2 0 0 1 0 6.4H7"/><path d="M6 5 3 8l3 3"/>'),
  redo: icon('<path d="M13 8H6a3.2 3.2 0 0 0 0 6.4h3"/><path d="M10 5l3 3-3 3"/>'),
};

function renderHtml(webview: vscode.Webview, mediaUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'grid.js'));
  const baseStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'base.css'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'grid.css'));
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
    <button id="commit" class="primary" hidden>${ICONS.commit}Commit</button>
    <button id="revert" hidden title="Discard pending changes">${ICONS.revert}Revert</button>
    <button id="undo" class="icon-only" title="Undo (Ctrl+Z)" disabled>${ICONS.undo}</button>
    <button id="redo" class="icon-only" title="Redo (Ctrl+Y)" disabled>${ICONS.redo}</button>
    <span id="status"></span>
    <span class="col-visibility">
      <button id="colMenuToggle" title="Show / hide columns">${ICONS.columns}Columns</button>
      <div id="colMenu" class="col-menu" hidden></div>
    </span>
    <span class="copy-format" title="Ctrl+C copies the selection, and Export writes a file, in this format">Format
      <select id="copyFormat">
        <option value="markdown">Markdown</option>
        <option value="insert">SQL Inserts</option>
        <option value="csv">CSV</option>
        <option value="html">HTML table</option>
        <option value="xml">XML</option>
        <option value="json">JSON</option>
      </select>
      <button id="exportBtn" title="Export the selection (or all rows) to a file">${ICONS.export}Export</button>
    </span>
    <button id="reload" title="Reload from the database (discards unsaved changes)">${ICONS.reload}Reload</button>
  </div>
  <div class="querybar">
    <label class="query-field where"><span class="query-label">WHERE</span>
      <input id="filter" type="search" placeholder="id = 1" spellcheck="false">
    </label>
    <label class="query-field order"><span class="query-label">ORDER BY</span>
      <input id="orderBy" type="search" placeholder="id DESC" spellcheck="false">
    </label>
  </div>
  <div id="notice" class="notice"></div>
  <div id="gridWrap"><table id="grid"></table></div>
  <div id="pendingDrawer" hidden>
    <div id="pendingHeader">
      <span id="pendingChevron" class="pending-chevron">▸</span>
      <span id="pendingTitle">Pending changes</span>
      <span class="pending-hint">the SQL that Commit will run</span>
    </div>
    <pre id="pendingBody" class="pending-body" hidden></pre>
  </div>
  <div id="pager">
    <button id="pagerFirst" title="First page">⏮</button>
    <button id="pagerPrev" title="Previous page">‹</button>
    <span id="pagerInfo"></span>
    <button id="pagerNext" title="Next page">›</button>
    <button id="pagerLast" title="Last page">⏭</button>
    <span class="pager-size">Rows:
      <select id="pageSize">
        <option>10</option>
        <option>20</option>
        <option>50</option>
        <option>100</option>
        <option>500</option>
        <option value="No">No</option>
      </select>
    </span>
  </div>
  <div id="valueModal" class="modal" hidden>
    <div class="modal-box">
      <div class="modal-head">
        <div class="modal-heading">
          <span id="valueModalTitle" class="modal-title">Edit JSON</span>
          <span id="valueModalColumn" class="modal-subtitle"></span>
        </div>
        <span id="valueStatus" class="value-status"></span>
      </div>
      <textarea id="valueModalText" spellcheck="false"></textarea>
      <div class="modal-actions">
        <button id="jsonFormat" title="Pretty-print and tidy (removes trailing commas)">Format</button>
        <span class="modal-spacer"></span>
        <span class="modal-hint"><kbd>Esc</kbd> cancel · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> save</span>
        <button id="valueModalCancel">Cancel</button>
        <button id="valueModalSave" class="primary">Save</button>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
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

// How many FK options to load per request (client shows them, server-side search narrows further).
const FK_LIMIT = 50;

// Text-ish column types worth showing as a foreign-key row's human label.
const TEXT_TYPE_RE = /char|text|varchar|string|enum/i;
// Preferred descriptive column names, best first.
const LABEL_NAMES = ['name', 'code', 'label', 'title', 'slug', 'reference', 'email', 'username', 'display_name'];

// A UUID/identifier column makes a useless label (it repeats or is opaque): char(36)/varchar(36),
// or a name that is clearly an id.
function isIdentifierColumn(column: ColumnMeta): boolean {
  return /36|uuid|uniqueidentifier/i.test(column.type) || /(^|_)id$|^uuid$/i.test(column.name);
}

// Pick the column that best describes a referenced row, in the user's priority order:
// name → code → label → other UNIQUE text column → other text column → none. UUID/id columns are
// never used as a label (they repeat or are opaque); then the dropdown shows just the key.
function pickDisplayColumn(columns: ColumnMeta[], indexes: IndexMeta[], refColumn: string): string | null {
  const textColumns = columns.filter((column) => column.name !== refColumn && TEXT_TYPE_RE.test(column.type));
  const named = LABEL_NAMES.map((name) => textColumns.find((column) => column.name.toLowerCase() === name)).find(Boolean);
  if (named) {
    return named.name;
  }
  // Fallbacks must be descriptive, so drop UUID/id-shaped columns entirely.
  const descriptive = textColumns.filter((column) => !isIdentifierColumn(column));
  const uniqueColumns = new Set(
    indexes.filter((index) => index.isUnique && index.columns.length === 1).map((index) => index.columns[0]),
  );
  const uniqueText = descriptive.find((column) => uniqueColumns.has(column.name));
  return (uniqueText ?? descriptive[0])?.name ?? null;
}

function buildNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

const EXPORT_EXTENSIONS: Record<CopyFormat, string> = {
  markdown: 'md',
  insert: 'sql',
  csv: 'csv',
  html: 'html',
  xml: 'xml',
  json: 'json',
};

function formatCopy(message: CopyMessage | ExportMessage): string {
  const { format, columns, rows } = message;
  if (format === 'csv') {
    const header = columns.map(csvCell).join(',');
    return [header, ...rows.map((row) => row.map((value) => csvCell(value ?? '')).join(','))].join('\n');
  }
  if (format === 'markdown') {
    const header = `| ${columns.join(' | ')} |`;
    const separator = `| ${columns.map(() => '---').join(' | ')} |`;
    const body = rows.map((row) => `| ${row.map((value) => (value ?? 'NULL').replace(/\|/g, '\\|')).join(' | ')} |`);
    return [header, separator, ...body].join('\n');
  }
  if (format === 'html') {
    const head = `<tr>${columns.map((column) => `<th>${escapeXml(column)}</th>`).join('')}</tr>`;
    const body = rows.map((row) => `<tr>${row.map((value) => `<td>${escapeXml(value ?? '')}</td>`).join('')}</tr>`);
    return `<table>\n<thead>${head}</thead>\n<tbody>\n${body.join('\n')}\n</tbody>\n</table>`;
  }
  if (format === 'xml') {
    const body = rows
      .map((row) => {
        const cells = columns.map((column, index) => `    <${column}>${escapeXml(row[index] ?? '')}</${column}>`).join('\n');
        return `  <row>\n${cells}\n  </row>`;
      })
      .join('\n');
    return `<rows>\n${body}\n</rows>`;
  }
  return JSON.stringify(
    rows.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]]))),
    null,
    2,
  );
}

// Substitute bound parameters (?, $1…) into a statement so the drawer shows runnable SQL.
function inlineParams(sql: string, params: unknown[]): string {
  let positional = 0;
  return sql.replace(/\$(\d+)|\?/g, (_match, numbered: string | undefined) => {
    const index = numbered ? Number(numbered) - 1 : positional++;
    const value = params[index];
    return sqlLiteral(value === null || value === undefined ? null : String(value));
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
