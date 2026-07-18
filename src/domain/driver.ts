import type {
  ColumnMeta,
  ForeignKeyMeta,
  IncomingForeignKey,
  IndexMeta,
  QueryResult,
  RoutineMeta,
  SchemaObjectKind,
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
  /** Foreign keys in other tables that reference this table (reverse of {@link listForeignKeys}). */
  listIncomingForeignKeys(namespace: string, table: string): Promise<IncomingForeignKey[]>;
  /** The CREATE TABLE statement for a table. */
  getTableDdl(namespace: string, table: string): Promise<string>;
  /** Non-table objects, empty when the engine has none of that kind. */
  listViews(namespace: string): Promise<string[]>;
  listRoutines(namespace: string): Promise<RoutineMeta[]>;
  listTriggers(namespace: string): Promise<string[]>;
  listSequences(namespace: string): Promise<string[]>;
  /** The source / definition of a non-table object, shown read-only. */
  getObjectDdl(namespace: string, kind: SchemaObjectKind, name: string): Promise<string>;
}

export interface StatementExecutor {
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  runWrite(sql: string, params: unknown[]): Promise<number>;
  /** Wrap a batch of writes so a failure rolls the whole thing back (same connection). */
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
  /** Set the active schema/database for subsequent unqualified queries (console schema picker). */
  useNamespace(namespace: string): Promise<void>;
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
