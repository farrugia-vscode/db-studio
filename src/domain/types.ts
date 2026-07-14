export type DriverKind = 'mysql' | 'postgres';

export interface ConnectionConfig {
  name: string;
  driver: DriverKind;
  host: string;
  port?: number;
  user: string;
  database?: string;
  /** Optional hex color (e.g. `#4ec94e`) used to tint the connection in the tree. */
  color?: string;
}

export interface ColumnMeta {
  name: string;
  type: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  /** Auto-increment (MySQL) or identity / serial (PostgreSQL): value is DB-generated on insert. */
  isAutoIncrement: boolean;
  /** Raw column default expression, or null when there is none. */
  defaultValue: string | null;
}

/** One column as edited in the table designer (create or modify). */
export interface ColumnDraft {
  /** Existing column name, or null for a column added in the editor. */
  originalName: string | null;
  name: string;
  type: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isAutoIncrement: boolean;
  /** Raw default expression (e.g. `0`, `'x'`, `CURRENT_TIMESTAMP`), or null. */
  defaultValue: string | null;
  /** Marked for removal (modify mode only). */
  drop: boolean;
}

export type Row = Record<string, unknown>;

export interface QueryResult {
  columns: string[];
  rows: Row[];
  affectedRows?: number;
}

export interface SqlStatement {
  sql: string;
  params: unknown[];
}
