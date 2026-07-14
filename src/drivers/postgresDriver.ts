import { Client } from 'pg';
import type { DatabaseDriver } from '../domain/driver';
import type {
  ColumnDraft,
  ColumnMeta,
  ConnectionConfig,
  ForeignKeyDraft,
  ForeignKeyMeta,
  IndexMeta,
  QueryResult,
  Row,
  TableDesign,
  TableSchema,
} from '../domain/types';
import { activeForeignKeys, activeIndexes, isCompleteForeignKey } from '../domain/ddlHelpers';

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

  buildCreateNamespace(name: string): string {
    return `CREATE SCHEMA ${this.quoteIdentifier(name)};`;
  }

  buildDropNamespace(name: string): string {
    return `DROP SCHEMA ${this.quoteIdentifier(name)} CASCADE;`;
  }

  async listIndexes(namespace: string, table: string): Promise<IndexMeta[]> {
    await this.connect();
    const result = await this.client!.query<{ name: string; is_unique: boolean; columns: string[] }>(
      `SELECT i.relname AS name, ix.indisunique AS is_unique,
              array_agg(a.attname ORDER BY k.ord) AS columns
       FROM pg_index ix
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
       WHERE n.nspname = $1 AND t.relname = $2 AND NOT ix.indisprimary
       GROUP BY i.relname, ix.indisunique`,
      [namespace, table],
    );
    return result.rows.map((row) => ({ name: row.name, isUnique: row.is_unique === true, columns: row.columns }));
  }

  async listForeignKeys(namespace: string, table: string): Promise<ForeignKeyMeta[]> {
    await this.connect();
    const result = await this.client!.query<{
      name: string;
      columns: string[];
      reftable: string;
      refcolumns: string[];
      del: string;
    }>(
      `SELECT con.conname AS name, cl.relname AS reftable, con.confdeltype AS del,
              (SELECT array_agg(att.attname ORDER BY k.ord)
               FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum) AS columns,
              (SELECT array_agg(att.attname ORDER BY k.ord)
               FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute att ON att.attrelid = con.confrelid AND att.attnum = k.attnum) AS refcolumns
       FROM pg_constraint con
       JOIN pg_class t ON t.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_class cl ON cl.oid = con.confrelid
       WHERE con.contype = 'f' AND n.nspname = $1 AND t.relname = $2`,
      [namespace, table],
    );
    const deleteRules: Record<string, string> = { r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
    return result.rows.map((row) => ({
      name: row.name,
      columns: row.columns,
      refTable: row.reftable,
      refColumns: row.refcolumns,
      onDelete: deleteRules[row.del] ?? '',
    }));
  }

  buildCreateTable(namespace: string, table: string, design: TableDesign): string[] {
    const ref = this.buildTableRef(namespace, table);
    const active = design.columns.filter((column) => !column.drop && column.name.trim() !== '');
    const lines = active.map((column) => `  ${this.columnDef(column)}`);
    const pk = active.filter((column) => column.isPrimaryKey).map((column) => this.quoteIdentifier(column.name));
    if (pk.length > 0) {
      lines.push(`  PRIMARY KEY (${pk.join(', ')})`);
    }
    const indexes = activeIndexes(design.indexes);
    for (const index of indexes.filter((entry) => entry.isUnique)) {
      const cols = index.columns.map((column) => this.quoteIdentifier(column)).join(', ');
      lines.push(`  CONSTRAINT ${this.quoteIdentifier(index.name)} UNIQUE (${cols})`);
    }
    for (const fk of activeForeignKeys(design.foreignKeys)) {
      lines.push(`  ${this.foreignKeyDef(fk)}`);
    }
    const statements = [`CREATE TABLE ${ref} (\n${lines.join(',\n')}\n);`];
    for (const index of indexes.filter((entry) => !entry.isUnique)) {
      const cols = index.columns.map((column) => this.quoteIdentifier(column)).join(', ');
      statements.push(`CREATE INDEX ${this.quoteIdentifier(index.name)} ON ${ref} (${cols});`);
    }
    return statements;
  }

  buildAlterTable(namespace: string, table: string, original: TableSchema, edited: TableDesign): string[] {
    const ref = this.buildTableRef(namespace, table);
    const originalByName = new Map(original.columns.map((column) => [column.name, column]));
    const statements: string[] = [];

    for (const draft of edited.columns) {
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

    const originalPk = original.columns.filter((column) => column.isPrimaryKey).map((column) => column.name).sort().join(',');
    const editedPk = edited.columns.filter((column) => !column.drop && column.isPrimaryKey).map((column) => column.name);
    if (originalPk !== [...editedPk].sort().join(',')) {
      statements.push(`ALTER TABLE ${ref} DROP CONSTRAINT IF EXISTS ${this.quoteIdentifier(`${table}_pkey`)};`);
      if (editedPk.length > 0) {
        statements.push(`ALTER TABLE ${ref} ADD PRIMARY KEY (${editedPk.map((name) => this.quoteIdentifier(name)).join(', ')});`);
      }
    }

    for (const index of edited.indexes) {
      if (index.drop) {
        if (index.originalName) {
          statements.push(
            index.isUnique
              ? `ALTER TABLE ${ref} DROP CONSTRAINT IF EXISTS ${this.quoteIdentifier(index.originalName)};`
              : `DROP INDEX IF EXISTS ${this.quoteIdentifier(namespace)}.${this.quoteIdentifier(index.originalName)};`,
          );
        }
      } else if (index.originalName === null && index.name.trim() !== '' && index.columns.length > 0) {
        const cols = index.columns.map((column) => this.quoteIdentifier(column)).join(', ');
        statements.push(
          index.isUnique
            ? `ALTER TABLE ${ref} ADD CONSTRAINT ${this.quoteIdentifier(index.name)} UNIQUE (${cols});`
            : `CREATE INDEX ${this.quoteIdentifier(index.name)} ON ${ref} (${cols});`,
        );
      }
    }

    for (const fk of edited.foreignKeys) {
      if (fk.drop) {
        if (fk.originalName) {
          statements.push(`ALTER TABLE ${ref} DROP CONSTRAINT IF EXISTS ${this.quoteIdentifier(fk.originalName)};`);
        }
      } else if (fk.originalName === null && isCompleteForeignKey(fk)) {
        statements.push(`ALTER TABLE ${ref} ADD ${this.foreignKeyDef(fk)};`);
      }
    }
    return statements;
  }

  private foreignKeyDef(fk: ForeignKeyDraft): string {
    const cols = fk.columns.map((column) => this.quoteIdentifier(column)).join(', ');
    const refCols = fk.refColumns.map((column) => this.quoteIdentifier(column)).join(', ');
    let def = `CONSTRAINT ${this.quoteIdentifier(fk.name)} FOREIGN KEY (${cols}) REFERENCES ${this.quoteIdentifier(fk.refTable)} (${refCols})`;
    if (fk.onDelete.trim() !== '') {
      def += ` ON DELETE ${fk.onDelete}`;
    }
    return def;
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
