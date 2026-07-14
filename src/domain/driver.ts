import type {
  ColumnMeta,
  ForeignKeyMeta,
  IndexMeta,
  QueryResult,
  TableDesign,
  TableSchema,
} from './types';

/**
 * Driver capabilities are split into focused interfaces (ISP) so each consumer
 * depends only on what it needs: the schema tree on {@link SchemaIntrospector},
 * the data grid on {@link StatementExecutor} + {@link SqlDialect}.
 */

export interface Connectable {
  connect(): Promise<void>;
  close(): Promise<void>;
}

export interface SchemaIntrospector {
  /** Databases (MySQL) or schemas (PostgreSQL). */
  listNamespaces(): Promise<string[]>;
  listTables(namespace: string): Promise<string[]>;
  listColumns(namespace: string, table: string): Promise<ColumnMeta[]>;
  listIndexes(namespace: string, table: string): Promise<IndexMeta[]>;
  listForeignKeys(namespace: string, table: string): Promise<ForeignKeyMeta[]>;
  /** The CREATE TABLE statement for a table. */
  getTableDdl(namespace: string, table: string): Promise<string>;
}

export interface StatementExecutor {
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  runWrite(sql: string, params: unknown[]): Promise<number>;
}

/** SQL syntax that varies per engine (quoting, placeholder style). */
export interface SqlDialect {
  quoteIdentifier(identifier: string): string;
  buildTableRef(namespace: string, table: string): string;
  /** Positional placeholder for parameter `index` (1-based): `?` or `$index`. */
  placeholder(index: number): string;
}

/** Generates DDL for creating databases/schemas and creating/altering tables (dialect-specific). */
export interface SchemaMutator {
  /** CREATE DATABASE (MySQL) or CREATE SCHEMA (PostgreSQL). */
  buildCreateNamespace(name: string): string;
  /** DROP DATABASE (MySQL) or DROP SCHEMA … CASCADE (PostgreSQL). */
  buildDropNamespace(name: string): string;
  buildCreateTable(namespace: string, table: string, design: TableDesign): string[];
  buildAlterTable(namespace: string, table: string, original: TableSchema, edited: TableDesign): string[];
}

export interface DatabaseDriver extends Connectable, SchemaIntrospector, StatementExecutor, SqlDialect, SchemaMutator {}
