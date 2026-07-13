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
