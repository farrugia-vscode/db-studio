import type { Row } from './types';

export type ExportFormat = 'csv' | 'json' | 'sql';

/** Coerce a driver value into the plain string (or null) used by every export format. */
export function normalizeCell(value: unknown): string | null {
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

export function toCsv(columns: string[], rows: Row[]): string {
  const header = columns.map(csvCell).join(',');
  const body = rows.map((row) => columns.map((column) => csvCell(normalizeCell(row[column]) ?? '')).join(','));
  return [header, ...body].join('\n');
}

export function toJson(columns: string[], rows: Row[]): string {
  return JSON.stringify(
    rows.map((row) => Object.fromEntries(columns.map((column) => [column, normalizeCell(row[column])]))),
    null,
    2,
  );
}

export function toSqlInserts(tableRef: string, quote: (identifier: string) => string, columns: string[], rows: Row[]): string {
  const cols = columns.map(quote).join(', ');
  return rows
    .map((row) => `INSERT INTO ${tableRef} (${cols}) VALUES (${columns.map((column) => sqlLiteral(normalizeCell(row[column]))).join(', ')});`)
    .join('\n');
}

/** Quote a CSV field only when it contains a delimiter, quote or newline. */
export function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** A SQL string/NULL literal (single quotes doubled). */
export function sqlLiteral(value: string | null): string {
  return value === null ? 'NULL' : `'${value.replace(/'/g, "''")}'`;
}
