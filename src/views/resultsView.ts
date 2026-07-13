import * as vscode from 'vscode';
import type { QueryResult } from '../domain/types';

/**
 * Renders arbitrary query results as a read-only HTML grid. Editing a specific
 * table is handled by the DataGridView instead.
 */
export class ResultsView {
  private panel: vscode.WebviewPanel | null = null;

  show(title: string, result: QueryResult, color?: string): void {
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
    this.panel.webview.html = this.renderHtml(result, color);
    this.panel.reveal();
  }

  private renderHtml(result: QueryResult, color?: string): string {
    if (result.columns.length === 0) {
      return this.wrap(`<div class="summary">Query OK · ${result.affectedRows ?? 0} row(s) affected.</div>`, color);
    }
    const head = result.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('');
    const body = result.rows
      .map((row) => {
        const cells = result.columns.map((column) => `<td>${escapeHtml(formatCell(row[column]))}</td>`).join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
    const table = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    return this.wrap(`<div class="summary">${result.rows.length} row(s)</div>${table}`, color);
  }

  private wrap(inner: string, color?: string): string {
    const vars = color ? `--conn:${escapeHtml(color)};` : '';
    const tinted = color ? ' class="tinted"' : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  :root { --conn: transparent; --cell-px: 12px; --cell-py: 7px; }
  html, body { height: 100%; }
  body { margin: 0; display: flex; flex-direction: column; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  body.tinted::before { content: ''; flex: 0 0 auto; height: 3px; background: var(--conn); }
  .summary { color: var(--vscode-descriptionForeground); font-size: 12px; padding: 10px 16px; }
  #results { overflow: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td {
    border-bottom: 1px solid var(--vscode-panel-border);
    border-right: 1px solid color-mix(in srgb, var(--vscode-panel-border) 40%, transparent);
    padding: var(--cell-py) var(--cell-px); text-align: left; white-space: nowrap;
  }
  th {
    position: sticky; top: 0; z-index: 1;
    background: var(--vscode-editorWidget-background); font-weight: 600; letter-spacing: 0.02em;
  }
  tbody tr:nth-child(even) td { background: color-mix(in srgb, var(--vscode-list-hoverBackground) 35%, transparent); }
  tbody tr:hover td { background: var(--vscode-list-hoverBackground); }
</style>
</head>
<body${tinted} style="${vars}">${inner}</body>
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
