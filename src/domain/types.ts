export type DriverKind = 'mysql' | 'postgres' | 'sqlite';

export interface ConnectionConfig {
  name: string;
  driver: DriverKind;
  /** Server host. Unused by SQLite, which connects to {@link ConnectionConfig.filePath}. */
  host?: string;
  port?: number;
  /** Server user. Unused by SQLite. */
  user?: string;
  database?: string;
  /** Absolute path to the database file (SQLite only). */
  filePath?: string;
  /** Optional colored-dot emoji shown before the connection name in the tree (e.g. `🔵`). */
  icon?: string;
  /** Optional folder the connection is filed under in the tree (e.g. `Clients`, `Staging`). */
  group?: string;
  /** When true, the connection blocks every write (edits, commits, DDL). Undefined = writable. */
  isReadOnly?: boolean;
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

/** A foreign key in another table that points at this table (for reverse navigation). */
export interface IncomingForeignKey {
  name: string;
  namespace: string;
  /** The referencing table. */
  table: string;
  /** Columns in the referencing table. */
  columns: string[];
  /** Columns in this (referenced) table those point at. */
  refColumns: string[];
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

/** Non-table schema objects surfaced in the tree, each shown as read-only DDL. */
export type SchemaObjectKind = 'view' | 'procedure' | 'function' | 'trigger' | 'sequence';

export interface RoutineMeta {
  name: string;
  kind: 'procedure' | 'function';
}

export type Row = Record<string, unknown>;

/** Where a result column really comes from — lets the console tell which cells are safely editable. */
export interface ColumnSource {
  /** Output name (alias). */
  name: string;
  /** Real source table, or null for an expression/aggregate/computed column. */
  sourceTable: string | null;
  /** Real source column, or null when not a plain column reference. */
  sourceColumn: string | null;
}

export interface QueryResult {
  columns: string[];
  rows: Row[];
  affectedRows?: number;
  /** Per-column provenance when the driver can supply it (MySQL); absent → treat as read-only. */
  fields?: ColumnSource[];
}

export interface SqlStatement {
  sql: string;
  params: unknown[];
}
