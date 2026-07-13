export type DriverKind = 'mysql' | 'postgres';

export interface ConnectionConfig {
  name: string;
  driver: DriverKind;
  host: string;
  port?: number;
  user: string;
  database?: string;
}

export interface ColumnMeta {
  name: string;
  type: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
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
