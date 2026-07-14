import { createConnection, type Connection } from 'mysql2/promise';
import type { FieldPacket, ResultSetHeader, RowDataPacket } from 'mysql2';
import type { DatabaseDriver } from '../domain/driver';
import type { ColumnDraft, ColumnMeta, ConnectionConfig, QueryResult, Row } from '../domain/types';

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
      // Return DATE/DATETIME/TIMESTAMP as raw strings (no Date object, no timezone shift).
      dateStrings: true,
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
      `SELECT column_name AS name, column_type AS type, is_nullable AS nullable, column_key AS keyType,
              extra AS extra, column_default AS dflt
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
      defaultValue: row.dflt === null || row.dflt === undefined ? null : String(row.dflt),
    }));
  }

  async getTableDdl(namespace: string, table: string): Promise<string> {
    const rows = await this.select(`SHOW CREATE TABLE ${this.buildTableRef(namespace, table)}`);
    const row = rows[0];
    return row ? String(row['Create Table'] ?? row['Create View'] ?? '') : '';
  }

  quoteIdentifier(identifier: string): string {
    return '`' + identifier.replace(/`/g, '``') + '`';
  }

  buildTableRef(namespace: string, table: string): string {
    return `${this.quoteIdentifier(namespace)}.${this.quoteIdentifier(table)}`;
  }

  buildCreateTable(namespace: string, table: string, columns: ColumnDraft[]): string {
    const active = columns.filter((column) => !column.drop && column.name.trim() !== '');
    const lines = active.map((column) => `  ${this.columnDef(column)}`);
    const pk = active.filter((column) => column.isPrimaryKey).map((column) => this.quoteIdentifier(column.name));
    if (pk.length > 0) {
      lines.push(`  PRIMARY KEY (${pk.join(', ')})`);
    }
    return `CREATE TABLE ${this.buildTableRef(namespace, table)} (\n${lines.join(',\n')}\n);`;
  }

  buildAlterTable(namespace: string, table: string, original: ColumnMeta[], edited: ColumnDraft[]): string[] {
    const ref = this.buildTableRef(namespace, table);
    const originalByName = new Map(original.map((column) => [column.name, column]));
    const statements: string[] = [];

    for (const draft of edited) {
      if (draft.drop) {
        if (draft.originalName) {
          statements.push(`ALTER TABLE ${ref} DROP COLUMN ${this.quoteIdentifier(draft.originalName)};`);
        }
        continue;
      }
      if (draft.name.trim() === '') {
        continue;
      }
      if (draft.originalName === null) {
        statements.push(`ALTER TABLE ${ref} ADD COLUMN ${this.columnDef(draft)};`);
      } else if (draft.name !== draft.originalName) {
        statements.push(`ALTER TABLE ${ref} CHANGE COLUMN ${this.quoteIdentifier(draft.originalName)} ${this.columnDef(draft)};`);
      } else if (columnChanged(originalByName.get(draft.originalName), draft)) {
        statements.push(`ALTER TABLE ${ref} MODIFY COLUMN ${this.columnDef(draft)};`);
      }
    }

    const originalPk = original.filter((column) => column.isPrimaryKey).map((column) => column.name).sort().join(',');
    const editedPk = edited.filter((column) => !column.drop && column.isPrimaryKey).map((column) => column.name);
    if (originalPk !== [...editedPk].sort().join(',')) {
      if (originalPk !== '') {
        statements.push(`ALTER TABLE ${ref} DROP PRIMARY KEY;`);
      }
      if (editedPk.length > 0) {
        statements.push(`ALTER TABLE ${ref} ADD PRIMARY KEY (${editedPk.map((name) => this.quoteIdentifier(name)).join(', ')});`);
      }
    }
    return statements;
  }

  private columnDef(column: ColumnDraft): string {
    let def = `${this.quoteIdentifier(column.name)} ${column.type}`;
    if (!column.isNullable) {
      def += ' NOT NULL';
    }
    if (column.isAutoIncrement) {
      def += ' AUTO_INCREMENT';
    }
    if (column.defaultValue !== null && column.defaultValue.trim() !== '') {
      def += ` DEFAULT ${column.defaultValue}`;
    }
    return def;
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

function columnChanged(original: ColumnMeta | undefined, draft: ColumnDraft): boolean {
  if (!original) {
    return true;
  }
  return (
    original.type.toLowerCase() !== draft.type.toLowerCase() ||
    original.isNullable !== draft.isNullable ||
    original.isAutoIncrement !== draft.isAutoIncrement ||
    (original.defaultValue ?? '') !== (draft.defaultValue ?? '')
  );
}
