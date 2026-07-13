import * as vscode from 'vscode';
import type { QueryResult } from '../domain/types';

/**
 * Renders arbitrary query results as a read-only HTML grid. Editing a specific
 * table is handled by the DataGridView instead.
 */
export class ResultsView {
  private panel: vscode.WebviewPanel | null = null;

  show(title: string, result: QueryResult): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel('dbStudio.results', title, vscode.ViewColumn.Active, {
        enableScripts: false,
        retainContextWhenHidden: true,
      });
      this.panel.onDidDispose(() => {
        this.panel = null;
      });
    }
    this.panel.title = title;
    this.panel.webview.html = this.renderHtml(result);
    this.panel.reveal();
  }

  private renderHtml(result: QueryResult): string {
    if (result.columns.length === 0) {
      return this.wrap(`<p class="empty">Query OK · ${result.affectedRows ?? 0} row(s) affected.</p>`);
    }
    const head = result.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('');
    const body = result.rows
      .map((row) => {
        const cells = result.columns.map((column) => `<td>${escapeHtml(formatCell(row[column]))}</td>`).join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
    const table = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    return this.wrap(`<p class="summary">${result.rows.length} row(s)</p>${table}`);
  }

  private wrap(inner: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-editor-font-family); color: var(--vscode-foreground); padding: 8px; }
  .summary, .empty { color: var(--vscode-descriptionForeground); margin: 4px 0 10px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { border: 1px solid var(--vscode-panel-border); padding: 3px 8px; text-align: left; white-space: nowrap; }
  th { position: sticky; top: 0; background: var(--vscode-editorWidget-background); }
  tr:nth-child(even) td { background: var(--vscode-list-hoverBackground); }
</style>
</head>
<body>${inner}</body>
</html>`;
  }
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
