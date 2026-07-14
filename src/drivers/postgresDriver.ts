import { Client } from 'pg';
import type { DatabaseDriver } from '../domain/driver';
import type { ColumnDraft, ColumnMeta, ConnectionConfig, QueryResult, Row } from '../domain/types';

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
      is_identity: string;
      column_default: string | null;
    }>(
      `SELECT c.column_name AS name, c.data_type AS type, c.is_nullable AS nullable,
              c.is_identity AS is_identity, c.column_default AS column_default,
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
      isAutoIncrement: row.is_identity === 'YES' || (row.column_default ?? '').startsWith('nextval('),
      defaultValue: row.column_default ?? null,
    }));
  }

  async getTableDdl(namespace: string, table: string): Promise<string> {
    await this.connect();
    const result = await this.client!.query<{
      column_name: string;
      data_type: string;
      character_maximum_length: number | null;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [namespace, table],
    );
    const columns = await this.listColumns(namespace, table);
    const pkColumns = columns.filter((column) => column.isPrimaryKey).map((column) => column.name);

    const lines = result.rows.map((row) => {
      const type = row.character_maximum_length ? `${row.data_type}(${row.character_maximum_length})` : row.data_type;
      let line = `  ${this.quoteIdentifier(row.column_name)} ${type}`;
      if (row.is_nullable === 'NO') {
        line += ' NOT NULL';
      }
      if (row.column_default) {
        line += ` DEFAULT ${row.column_default}`;
      }
      return line;
    });
    if (pkColumns.length > 0) {
      lines.push(`  PRIMARY KEY (${pkColumns.map((column) => this.quoteIdentifier(column)).join(', ')})`);
    }
    return `CREATE TABLE ${this.buildTableRef(namespace, table)} (\n${lines.join(',\n')}\n);`;
  }

  quoteIdentifier(identifier: string): string {
    return '"' + identifier.replace(/"/g, '""') + '"';
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
        continue;
      }
      const orig = originalByName.get(draft.originalName);
      let currentName = draft.originalName;
      if (draft.name !== draft.originalName) {
        statements.push(`ALTER TABLE ${ref} RENAME COLUMN ${this.quoteIdentifier(draft.originalName)} TO ${this.quoteIdentifier(draft.name)};`);
        currentName = draft.name;
      }
      const quoted = this.quoteIdentifier(currentName);
      if (!orig || orig.type.toLowerCase() !== draft.type.toLowerCase()) {
        statements.push(`ALTER TABLE ${ref} ALTER COLUMN ${quoted} TYPE ${draft.type};`);
      }
      if (!orig || orig.isNullable !== draft.isNullable) {
        statements.push(`ALTER TABLE ${ref} ALTER COLUMN ${quoted} ${draft.isNullable ? 'DROP' : 'SET'} NOT NULL;`);
      }
      const originalDefault = orig?.defaultValue ?? '';
      const draftDefault = draft.defaultValue ?? '';
      if (originalDefault !== draftDefault) {
        statements.push(
          draftDefault.trim() !== ''
            ? `ALTER TABLE ${ref} ALTER COLUMN ${quoted} SET DEFAULT ${draftDefault};`
            : `ALTER TABLE ${ref} ALTER COLUMN ${quoted} DROP DEFAULT;`,
        );
      }
    }

    const originalPk = original.filter((column) => column.isPrimaryKey).map((column) => column.name).sort().join(',');
    const editedPk = edited.filter((column) => !column.drop && column.isPrimaryKey).map((column) => column.name);
    if (originalPk !== [...editedPk].sort().join(',')) {
      statements.push(`ALTER TABLE ${ref} DROP CONSTRAINT IF EXISTS ${this.quoteIdentifier(`${table}_pkey`)};`);
      if (editedPk.length > 0) {
        statements.push(`ALTER TABLE ${ref} ADD PRIMARY KEY (${editedPk.map((name) => this.quoteIdentifier(name)).join(', ')});`);
      }
    }
    return statements;
  }

  private columnDef(column: ColumnDraft): string {
    let def = `${this.quoteIdentifier(column.name)} ${column.type}`;
    if (column.isAutoIncrement) {
      def += ' GENERATED BY DEFAULT AS IDENTITY';
    }
    if (!column.isNullable) {
      def += ' NOT NULL';
    }
    if (column.defaultValue !== null && column.defaultValue.trim() !== '') {
      def += ` DEFAULT ${column.defaultValue}`;
    }
    return def;
  }

  placeholder(index: number): string {
    return `$${index}`;
  }

  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    await this.connect();
    const result = await this.client!.query(sql, params);
    const columns = result.fields ? result.fields.map((field) => field.name) : Object.keys(result.rows[0] ?? {});
    return { columns, rows: result.rows as Row[], affectedRows: result.rowCount ?? undefined };
  }

  async runWrite(sql: string, params: unknown[]): Promise<number> {
    await this.connect();
    const result = await this.client!.query(sql, params);
    return result.rowCount ?? 0;
  }
}
