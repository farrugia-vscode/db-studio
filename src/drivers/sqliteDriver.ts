import { existsSync } from 'node:fs';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type { DatabaseDriver } from '../domain/driver';
import { activeForeignKeys, activeIndexes } from '../domain/ddlHelpers';
import type {
  ColumnDraft,
  ColumnMeta,
  ColumnSource,
  ConnectionConfig,
  ForeignKeyDraft,
  ForeignKeyMeta,
  IncomingForeignKey,
  IndexMeta,
  QueryResult,
  RoutineMeta,
  Row,
  SchemaObjectKind,
  TableDesign,
  TableSchema,
} from '../domain/types';

/** Internal bookkeeping tables SQLite creates on its own — never shown in the tree. */
const INTERNAL_TABLE_PREFIX = 'sqlite_';

interface TableInfoRow {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface ForeignKeyRow {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string | null;
  on_delete: string;
}

/**
 * SQLite driver built on the `node:sqlite` module bundled with the runtime, so
 * it needs no dependency and no native build. A connection is bound to a single
 * file; a "namespace" maps to an attached schema, which is `main` unless the
 * file itself attaches more.
 *
 * The engine is synchronous: every method resolves immediately and the async
 * signatures exist only to satisfy {@link DatabaseDriver}.
 */
export class SqliteDriver implements DatabaseDriver {
  private database: DatabaseSync | null = null;

  constructor(private readonly config: ConnectionConfig) {}

  async connect(): Promise<void> {
    if (this.database) {
      return;
    }
    const filePath = this.config.filePath?.trim() ?? '';
    if (filePath === '') {
      throw new Error('No database file set for this SQLite connection.');
    }
    // Opening for write would silently create an empty file on a typo, so the
    // missing-file case is reported rather than papered over.
    if (!existsSync(filePath)) {
      throw new Error(`Database file not found: ${filePath}`);
    }
    this.database = new DatabaseSync(filePath, { readOnly: this.config.isReadOnly === true });
  }

  async close(): Promise<void> {
    if (!this.database) {
      return;
    }
    this.database.close();
    this.database = null;
  }

  async listNamespaces(): Promise<string[]> {
    const rows = await this.select('PRAGMA database_list');
    return rows.map((row) => String(row.name));
  }

  async listTables(namespace: string): Promise<string[]> {
    return this.listMasterNames(namespace, 'table');
  }

  async listViews(namespace: string): Promise<string[]> {
    return this.listMasterNames(namespace, 'view');
  }

  /** SQLite keeps no row statistics and a COUNT(*) would block the host on big tables. */
  async estimateRowCounts(): Promise<Map<string, number>> {
    return new Map();
  }

  async listTriggers(namespace: string): Promise<string[]> {
    return this.listMasterNames(namespace, 'trigger');
  }

  /** SQLite has no stored routines. */
  async listRoutines(): Promise<RoutineMeta[]> {
    return [];
  }

  /** SQLite has no sequences (AUTOINCREMENT uses the internal `sqlite_sequence` table). */
  async listSequences(): Promise<string[]> {
    return [];
  }

  async listColumns(namespace: string, table: string): Promise<ColumnMeta[]> {
    const rows = (await this.select(this.buildPragma(namespace, 'table_info', table))) as unknown as TableInfoRow[];
    const primaryKeys = rows.filter((row) => row.pk > 0);
    return rows.map((row) => ({
      name: row.name,
      type: row.type,
      isNullable: row.notnull === 0,
      isPrimaryKey: row.pk > 0,
      // A lone INTEGER PRIMARY KEY aliases the rowid, so the value is generated
      // on insert whether or not the table declares AUTOINCREMENT.
      isAutoIncrement: row.pk > 0 && primaryKeys.length === 1 && row.type.toUpperCase() === 'INTEGER',
      defaultValue: row.dflt_value,
    }));
  }

  async listIndexes(namespace: string, table: string): Promise<IndexMeta[]> {
    const indexes = await this.select(this.buildPragma(namespace, 'index_list', table));
    const metas: IndexMeta[] = [];
    for (const index of indexes) {
      // `pk` origin is the primary key itself, already shown as a column flag.
      if (String(index.origin) === 'pk') {
        continue;
      }
      const name = String(index.name);
      const columns = await this.select(this.buildPragma(namespace, 'index_info', name));
      metas.push({
        name,
        isUnique: Number(index.unique) === 1,
        // Expression indexes report a null column name; they have no plain column to list.
        columns: columns.map((column) => String(column.name ?? '')).filter((column) => column !== ''),
      });
    }
    return metas;
  }

  async listForeignKeys(namespace: string, table: string): Promise<ForeignKeyMeta[]> {
    const rows = (await this.select(
      this.buildPragma(namespace, 'foreign_key_list', table),
    )) as unknown as ForeignKeyRow[];
    return this.groupForeignKeys(rows).map((group) => ({
      // SQLite drops constraint names from the catalog, so the reference reads as the name.
      name: `fk_${table}_${group.columns.join('_')}`,
      columns: group.columns,
      refTable: group.refTable,
      refColumns: group.refColumns,
      onDelete: group.onDelete === 'NO ACTION' ? '' : group.onDelete,
    }));
  }

  async listIncomingForeignKeys(namespace: string, table: string): Promise<IncomingForeignKey[]> {
    const incoming: IncomingForeignKey[] = [];
    // No catalog view lists reverse references, so every table is asked in turn.
    for (const candidate of await this.listTables(namespace)) {
      if (candidate === table) {
        continue;
      }
      const rows = (await this.select(
        this.buildPragma(namespace, 'foreign_key_list', candidate),
      )) as unknown as ForeignKeyRow[];
      for (const group of this.groupForeignKeys(rows)) {
        if (group.refTable.toLowerCase() !== table.toLowerCase()) {
          continue;
        }
        incoming.push({
          name: `fk_${candidate}_${group.columns.join('_')}`,
          namespace,
          table: candidate,
          columns: group.columns,
          refColumns: group.refColumns,
        });
      }
    }
    return incoming;
  }

  async getTableDdl(namespace: string, table: string): Promise<string> {
    return this.getMasterSql(namespace, 'table', table);
  }

  async getObjectDdl(namespace: string, kind: SchemaObjectKind, name: string): Promise<string> {
    if (kind !== 'view' && kind !== 'trigger') {
      return '';
    }
    return this.getMasterSql(namespace, kind, name);
  }

  quoteIdentifier(identifier: string): string {
    return '"' + identifier.replace(/"/g, '""') + '"';
  }

  buildTableRef(namespace: string, table: string): string {
    return `${this.quoteIdentifier(namespace)}.${this.quoteIdentifier(table)}`;
  }

  placeholder(): string {
    return '?';
  }

  buildCreateNamespace(name: string): string {
    throw new Error(`SQLite has no databases to create ("${name}"): one connection is one file.`);
  }

  buildDropNamespace(name: string): string {
    throw new Error(`SQLite has no databases to drop ("${name}"): delete the file instead.`);
  }

  buildCreateTable(namespace: string, table: string, design: TableDesign): string[] {
    const ref = this.buildTableRef(namespace, table);
    const columns = design.columns.filter((column) => !column.drop && column.name.trim() !== '');
    const primaryKeys = columns.filter((column) => column.isPrimaryKey);
    // A single INTEGER PRIMARY KEY must stay inline: that is the only spelling
    // SQLite treats as a rowid alias, and the only one AUTOINCREMENT accepts.
    const isInlinePrimaryKey = primaryKeys.length === 1;
    const lines = columns.map((column) => `  ${this.buildColumnDef(column, isInlinePrimaryKey)}`);
    if (primaryKeys.length > 1) {
      lines.push(`  PRIMARY KEY (${primaryKeys.map((column) => this.quoteIdentifier(column.name)).join(', ')})`);
    }
    for (const foreignKey of activeForeignKeys(design.foreignKeys)) {
      lines.push(`  ${this.buildForeignKeyDef(foreignKey)}`);
    }

    const statements = [`CREATE TABLE ${ref} (\n${lines.join(',\n')}\n);`];
    for (const index of activeIndexes(design.indexes)) {
      statements.push(this.buildCreateIndex(namespace, table, index.name, index.isUnique, index.columns));
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
        statements.push(`ALTER TABLE ${ref} ADD COLUMN ${this.buildColumnDef(draft, false)};`);
        continue;
      }
      if (draft.name !== draft.originalName) {
        statements.push(
          `ALTER TABLE ${ref} RENAME COLUMN ${this.quoteIdentifier(draft.originalName)} TO ${this.quoteIdentifier(draft.name)};`,
        );
      }
      this.checkAlterableColumn(originalByName.get(draft.originalName), draft);
    }

    this.checkUnchangedPrimaryKey(original, edited);

    for (const index of edited.indexes) {
      if (index.drop) {
        if (index.originalName) {
          statements.push(`DROP INDEX IF EXISTS ${this.buildTableRef(namespace, index.originalName)};`);
        }
        continue;
      }
      if (index.originalName === null && index.name.trim() !== '' && index.columns.length > 0) {
        statements.push(this.buildCreateIndex(namespace, table, index.name, index.isUnique, index.columns));
      }
    }

    const hasForeignKeyChange = edited.foreignKeys.some((foreignKey) => foreignKey.drop || foreignKey.originalName === null);
    if (hasForeignKeyChange) {
      throw new Error('SQLite cannot add or drop a foreign key on an existing table; recreate the table instead.');
    }
    return statements;
  }

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    await this.connect();
    const statement = this.database!.prepare(sql);
    const fields = this.buildColumnSources(statement);
    if (fields.length === 0) {
      const written = statement.run(...this.bindable(params));
      return { columns: [], rows: [], affectedRows: Number(written.changes) };
    }
    const rows = statement.all(...this.bindable(params)) as Row[];
    return { columns: fields.map((field) => field.name), rows: rows.map((row) => this.readableRow(row)), fields };
  }

  async runWrite(sql: string, params: unknown[]): Promise<number> {
    await this.connect();
    const written = this.database!.prepare(sql).run(...this.bindable(params));
    return Number(written.changes);
  }

  async beginTransaction(): Promise<void> {
    await this.connect();
    this.database!.exec('BEGIN');
  }

  async commitTransaction(): Promise<void> {
    this.database?.exec('COMMIT');
  }

  async rollbackTransaction(): Promise<void> {
    this.database?.exec('ROLLBACK');
  }

  /** node:sqlite runs statements synchronously: nothing to interrupt from outside. */
  async cancelRunning(): Promise<boolean> {
    return false;
  }

  /** No-op: SQLite has no `USE`, every query already qualifies its schema. */
  async useNamespace(): Promise<void> {
    await this.connect();
  }

  private async listMasterNames(namespace: string, type: string): Promise<string[]> {
    const rows = await this.select(
      `SELECT name FROM ${this.quoteIdentifier(namespace)}.sqlite_master
       WHERE type = ? AND name NOT LIKE '${INTERNAL_TABLE_PREFIX}%' ORDER BY name`,
      [type],
    );
    return rows.map((row) => String(row.name));
  }

  private async getMasterSql(namespace: string, type: string, name: string): Promise<string> {
    const rows = await this.select(
      `SELECT sql FROM ${this.quoteIdentifier(namespace)}.sqlite_master WHERE type = ? AND name = ? LIMIT 1`,
      [type, name],
    );
    const sql = rows[0]?.sql;
    return sql === null || sql === undefined ? '' : `${String(sql)};`;
  }

  /** PRAGMA takes no placeholders, so the argument is quoted as a string literal. */
  private buildPragma(namespace: string, pragma: string, argument: string): string {
    return `PRAGMA ${this.quoteIdentifier(namespace)}.${pragma}('${argument.replace(/'/g, "''")}')`;
  }

  private async select(sql: string, params: unknown[] = []): Promise<Row[]> {
    await this.connect();
    return this.database!.prepare(sql).all(...this.bindable(params)) as Row[];
  }

  /** Groups the one-row-per-column PRAGMA output back into whole constraints. */
  private groupForeignKeys(
    rows: ForeignKeyRow[],
  ): Array<{ columns: string[]; refTable: string; refColumns: string[]; onDelete: string }> {
    const groups = new Map<number, { columns: string[]; refTable: string; refColumns: string[]; onDelete: string }>();
    for (const row of [...rows].sort((left, right) => left.seq - right.seq)) {
      const group = groups.get(row.id) ?? { columns: [], refTable: row.table, refColumns: [], onDelete: row.on_delete };
      group.columns.push(row.from);
      // A null target means the reference points at the referenced table's primary key.
      group.refColumns.push(row.to ?? '');
      groups.set(row.id, group);
    }
    return [...groups.values()];
  }

  private buildCreateIndex(namespace: string, table: string, name: string, isUnique: boolean, columns: string[]): string {
    const quotedColumns = columns.map((column) => this.quoteIdentifier(column)).join(', ');
    // The index lives in the table's schema, so only the index name is qualified.
    return `CREATE ${isUnique ? 'UNIQUE ' : ''}INDEX ${this.buildTableRef(namespace, name)} ON ${this.quoteIdentifier(table)} (${quotedColumns});`;
  }

  private buildColumnDef(column: ColumnDraft, isInlinePrimaryKey: boolean): string {
    let definition = `${this.quoteIdentifier(column.name)} ${column.type}`;
    if (column.isPrimaryKey && isInlinePrimaryKey) {
      definition += ' PRIMARY KEY';
      if (column.isAutoIncrement) {
        definition += ' AUTOINCREMENT';
      }
    }
    if (!column.isNullable) {
      definition += ' NOT NULL';
    }
    if (column.defaultValue !== null && column.defaultValue.trim() !== '') {
      definition += ` DEFAULT ${column.defaultValue}`;
    }
    return definition;
  }

  private buildForeignKeyDef(foreignKey: ForeignKeyDraft): string {
    const columns = foreignKey.columns.map((column) => this.quoteIdentifier(column)).join(', ');
    const refColumns = foreignKey.refColumns.map((column) => this.quoteIdentifier(column)).join(', ');
    let definition = `FOREIGN KEY (${columns}) REFERENCES ${this.quoteIdentifier(foreignKey.refTable)} (${refColumns})`;
    if (foreignKey.onDelete.trim() !== '') {
      definition += ` ON DELETE ${foreignKey.onDelete}`;
    }
    return definition;
  }

  /**
   * SQLite's ALTER TABLE only renames, adds and drops columns: anything else
   * needs the table rebuilt, which the designer does not do.
   */
  private checkAlterableColumn(original: ColumnMeta | undefined, draft: ColumnDraft): void {
    if (!original) {
      return;
    }
    const unsupported: string[] = [];
    if (original.type.toLowerCase() !== draft.type.toLowerCase()) {
      unsupported.push('type');
    }
    if (original.isNullable !== draft.isNullable) {
      unsupported.push('nullability');
    }
    if ((original.defaultValue ?? '') !== (draft.defaultValue ?? '')) {
      unsupported.push('default value');
    }
    if (unsupported.length === 0) {
      return;
    }
    throw new Error(
      `SQLite cannot change the ${unsupported.join(' or ')} of column "${draft.name}"; recreate the table instead.`,
    );
  }

  private checkUnchangedPrimaryKey(original: TableSchema, edited: TableDesign): void {
    const before = original.columns.filter((column) => column.isPrimaryKey).map((column) => column.name);
    const after = edited.columns.filter((column) => !column.drop && column.isPrimaryKey).map((column) => column.name);
    if ([...before].sort().join(',') !== [...after].sort().join(',')) {
      throw new Error('SQLite cannot change the primary key of an existing table; recreate the table instead.');
    }
  }

  /**
   * Column provenance comes straight from the engine, which reports a null
   * table for expressions and aggregates — exactly what the console needs to
   * tell editable cells from computed ones.
   */
  private buildColumnSources(statement: StatementSync): ColumnSource[] {
    return statement.columns().map((column) => ({
      name: column.name,
      sourceTable: column.table,
      sourceColumn: column.column,
    }));
  }

  /** Coerces JS values into the four types SQLite can bind. */
  private bindable(params: unknown[]): Array<null | number | bigint | string | Uint8Array> {
    return params.map((param) => {
      if (param === null || param === undefined) {
        return null;
      }
      if (typeof param === 'boolean') {
        return param ? 1n : 0n;
      }
      if (param instanceof Date) {
        return param.toISOString();
      }
      // Plain JS numbers bind as REAL, which a TEXT column would store as "1.0";
      // whole numbers go through BigInt so they stay integers.
      if (typeof param === 'number') {
        return Number.isInteger(param) ? BigInt(param) : param;
      }
      if (typeof param === 'bigint' || typeof param === 'string') {
        return param;
      }
      if (param instanceof Uint8Array) {
        return param;
      }
      return String(param);
    });
  }

  /** Renders BLOBs as SQL blob literals so they survive the trip to the webview. */
  private readableRow(row: Row): Row {
    const readable: Row = {};
    for (const [name, value] of Object.entries(row)) {
      readable[name] = value instanceof Uint8Array ? `x'${Buffer.from(value).toString('hex')}'` : value;
    }
    return readable;
  }
}
