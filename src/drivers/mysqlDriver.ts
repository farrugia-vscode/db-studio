import { createConnection, type Connection } from 'mysql2/promise';
import type { FieldPacket, ResultSetHeader, RowDataPacket } from 'mysql2';
import type { DatabaseDriver } from '../domain/driver';
import type { ColumnMeta, ConnectionConfig, QueryResult, Row } from '../domain/types';

const HIDDEN_DATABASES = ['information_schema', 'performance_schema', 'mysql', 'sys'];

/**
 * MySQL / MariaDB driver. A "namespace" maps to a MySQL database (schema).
 */
export class MysqlDriver implements DatabaseDriver {
  private connection: Connection | null = null;

  constructor(
    private readonly config: ConnectionConfig,
    private readonly password: string,
  ) {}

  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }
    this.connection = await createConnection({
      host: this.config.host,
      port: this.config.port ?? 3306,
      user: this.config.user,
      password: this.password,
      database: this.config.database || undefined,
      multipleStatements: false,
    });
  }

  async close(): Promise<void> {
    if (!this.connection) {
      return;
    }
    await this.connection.end();
    this.connection = null;
  }

  async listNamespaces(): Promise<string[]> {
    const rows = await this.select('SHOW DATABASES');
    return rows
      .map((row) => String(Object.values(row)[0]))
      .filter((name) => !HIDDEN_DATABASES.includes(name));
  }

  async listTables(namespace: string): Promise<string[]> {
    const rows = await this.select(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name',
      [namespace],
    );
    return rows.map((row) => String(row.name));
  }

  async listColumns(namespace: string, table: string): Promise<ColumnMeta[]> {
    const rows = await this.select(
      `SELECT column_name AS name, column_type AS type, is_nullable AS nullable, column_key AS keyType, extra AS extra
       FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ?
       ORDER BY ordinal_position`,
      [namespace, table],
    );
    return rows.map((row) => ({
      name: String(row.name),
      type: String(row.type),
      isNullable: row.nullable === 'YES',
      isPrimaryKey: row.keyType === 'PRI',
      isAutoIncrement: String(row.extra).includes('auto_increment'),
    }));
  }

  quoteIdentifier(identifier: string): string {
    return '`' + identifier.replace(/`/g, '``') + '`';
  }

  buildTableRef(namespace: string, table: string): string {
    return `${this.quoteIdentifier(namespace)}.${this.quoteIdentifier(table)}`;
  }

  placeholder(): string {
    return '?';
  }

  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    await this.connect();
    const [result, fields] = await this.connection!.query(sql, params);
    if (!Array.isArray(result)) {
      return { columns: [], rows: [], affectedRows: (result as ResultSetHeader).affectedRows };
    }
    const rows = result as RowDataPacket[];
    const columns = fields
      ? (fields as FieldPacket[]).map((field) => field.name)
      : Object.keys(rows[0] ?? {});
    return { columns, rows: rows as Row[] };
  }

  async runWrite(sql: string, params: unknown[]): Promise<number> {
    await this.connect();
    const [result] = await this.connection!.query<ResultSetHeader>(sql, params);
    return result.affectedRows;
  }

  private async select(sql: string, params: unknown[] = []): Promise<RowDataPacket[]> {
    await this.connect();
    const [rows] = await this.connection!.query<RowDataPacket[]>(sql, params);
    return rows;
  }
}
