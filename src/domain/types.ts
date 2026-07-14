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
  /** Optional emoji shown before the connection name in the tree (e.g. `🚀`). */
  icon?: string;
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

export interface IndexMeta {
  name: string;
  isUnique: boolean;
  columns: string[];
}

export interface ForeignKeyMeta {
  name: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete: string;
}

/** An index as edited in the designer. */
export interface IndexDraft {
  originalName: string | null;
  name: string;
  isUnique: boolean;
  columns: string[];
  drop: boolean;
}

/** A foreign key as edited in the designer. */
export interface ForeignKeyDraft {
  originalName: string | null;
  name: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete: string;
  drop: boolean;
}

/** The full edited state of a table in the designer. */
export interface TableDesign {
  columns: ColumnDraft[];
  indexes: IndexDraft[];
  foreignKeys: ForeignKeyDraft[];
}

/** The current schema of an existing table (for the modify diff). */
export interface TableSchema {
  columns: ColumnMeta[];
  indexes: IndexMeta[];
  foreignKeys: ForeignKeyMeta[];
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
