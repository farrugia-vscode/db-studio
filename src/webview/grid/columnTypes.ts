import type { ColumnMeta } from '../../domain/types';
import type { CellValue } from './rowModel';

export type ValueEditor = 'json' | 'text';

export function isDateColumn(type: string): boolean {
  const normalized = type.toLowerCase();
  return normalized === 'date' || normalized.includes('timestamp') || normalized.includes('datetime');
}

export function dateInputType(type: string): 'date' | 'datetime-local' | null {
  if (!isDateColumn(type)) {
    return null;
  }
  return type.toLowerCase() === 'date' ? 'date' : 'datetime-local';
}

// Parses `enum('a','b','c')` (MySQL) into its allowed values, or null if not an enum.
export function enumValues(type: string): string[] | null {
  const match = /^enum\((.*)\)$/i.exec(type.trim());
  if (!match) {
    return null;
  }
  return match[1].split(',').map((part) => part.trim().replace(/^'(.*)'$/, '$1').replace(/''/g, "'"));
}

// A value stored in a text column but shaped like JSON (object/array) deserves the JSON editor.
export function looksLikeJson(value: CellValue): boolean {
  return value !== null && /^\s*[[{]/.test(value);
}

// TEXT, TINYTEXT…LONGTEXT (MySQL), text/citext (PostgreSQL), TEXT/CLOB (SQLite); never VARCHAR.
export function isLongTextColumn(type: string): boolean {
  return /text|clob/.test(type.toLowerCase());
}

// Which multi-line modal a cell opens, if any: JSON for JSON columns and for text columns holding
// a JSON-shaped value, plain text for TEXT/CLOB columns. Single-line types edit inline.
export function valueEditorFor(type: string, value: CellValue): ValueEditor | null {
  if (type.toLowerCase().includes('json') || looksLikeJson(value)) {
    return 'json';
  }
  return isLongTextColumn(type) ? 'text' : null;
}

// Single-line inline editing applies to everything that has no dedicated editor.
export function isPlainTextColumn(type: string): boolean {
  const lower = type.toLowerCase();
  return !isDateColumn(lower) && !lower.includes('json') && enumValues(type) === null;
}

// ENUM/SET spell out every value, which would flood the header: keep the keyword only (the full
// type stays in the hover title and the values in the cell dropdown).
export function compactType(type: string): string {
  const lower = type.toLowerCase();
  const enumLike = /^(enum|set)\(/.exec(lower);
  return enumLike ? enumLike[1] : lower;
}

// Anchored on the base type so `bigint unsigned`, `int(11)` or `numeric(10,2)` all count, while
// `point` or `interval` do not.
export function isNumericColumn(type: string): boolean {
  return /^(?:(?:tiny|small|medium|big)?int(?:eger)?|(?:big|small)?serial|decimal|numeric|float\d*|double(?: precision)?|real|bit|number|money)\b/i.test(
    type.trim(),
  );
}

// Numeric columns stay unquoted; everything else is single-quoted with quotes doubled for escaping.
export function whereLiteral(column: ColumnMeta, value: string): string {
  if (isNumericColumn(column.type)) {
    return value;
  }
  return `'${value.replace(/'/g, "''")}'`;
}
