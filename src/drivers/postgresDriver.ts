import { Client } from 'pg';
import type { DatabaseDriver } from '../domain/driver';
import type { ColumnMeta, ConnectionConfig, QueryResult, Row } from '../domain/types';

/**
 * PostgreSQL driver. A connection is bound to a single database; a "namespace"
 * maps to a schema.
 */
export class PostgresDriver implements DatabaseDriver {
  private client: Client | null = null;

  constructor(
    private readonly config: ConnectionConfig,
    private readonly password: string,
  ) {}

  async connect(): Promise<void> {
    if (this.client) {
      return;
    }
    this.client = new Client({
      host: this.config.host,
      port: this.config.port ?? 5432,
      user: this.config.user,
      password: this.password,
      database: this.config.database || 'postgres',
    });
    await this.client.connect();
  }

  async close(): Promise<void> {
    if (!this.client) {
      return;
    }
    await this.client.end();
    this.client = null;
  }

  async listNamespaces(): Promise<string[]> {
    await this.connect();
    const result = await this.client!.query<{ name: string }>(
      `SELECT schema_name AS name FROM information_schema.schemata
       WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
         AND schema_name NOT LIKE 'pg_%'
       ORDER BY schema_name`,
    );
    return result.rows.map((row) => row.name);
  }

  async listTables(namespace: string): Promise<string[]> {
    await this.connect();
    const result = await this.client!.query<{ name: string }>(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = $1 ORDER BY table_name`,
      [namespace],
    );
    return result.rows.map((row) => row.name);
  }

  async listColumns(namespace: string, table: string): Promise<ColumnMeta[]> {
    await this.connect();
    const result = await this.client!.query<{
      name: string;
      type: string;
      nullable: string;
      is_primary_key: boolean;
    }>(
      `SELECT c.column_name AS name, c.data_type AS type, c.is_nullable AS nullable,
              (pk.column_name IS NOT NULL) AS is_primary_key
       FROM information_schema.columns c
       LEFT JOIN (
         SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
         WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2
       ) pk ON pk.column_name = c.column_name
       WHERE c.table_schema = $1 AND c.table_name = $2
       ORDER BY c.ordinal_position`,
      [namespace, table],
    );
    return result.rows.map((row) => ({
      name: row.name,
      type: row.type,
      isNullable: row.nullable === 'YES',
      isPrimaryKey: row.is_primary_key === true,
    }));
  }

  quoteIdentifier(identifier: string): string {
    return '"' + identifier.replace(/"/g, '""') + '"';
  }

  buildTableRef(namespace: string, table: string): string {
    return `${this.quoteIdentifier(namespace)}.${this.quoteIdentifier(table)}`;
  }

  placeholder(index: number): string {
    return `$${index}`;
  }

  async query(sql: string): Promise<QueryResult> {
    await this.connect();
    const result = await this.client!.query(sql);
    const columns = result.fields ? result.fields.map((field) => field.name) : Object.keys(result.rows[0] ?? {});
    return { columns, rows: result.rows as Row[], affectedRows: result.rowCount ?? undefined };
  }

  async runWrite(sql: string, params: unknown[]): Promise<number> {
    await this.connect();
    const result = await this.client!.query(sql, params);
    return result.rowCount ?? 0;
  }
}
