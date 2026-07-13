import type { Edit } from './edit';
import type { SqlDialect } from '../driver';
import type { Row, SqlStatement } from '../types';

/** INSERT INTO ... (columns) VALUES (...). */
export class InsertEdit implements Edit {
  constructor(private readonly values: Row) {}

  toStatement(dialect: SqlDialect, tableRef: string): SqlStatement {
    const columns = Object.keys(this.values);
    const quotedColumns = columns.map((column) => dialect.quoteIdentifier(column));
    const placeholders = columns.map((_column, index) => dialect.placeholder(index + 1));
    return {
      sql: `INSERT INTO ${tableRef} (${quotedColumns.join(', ')}) VALUES (${placeholders.join(', ')})`,
      params: columns.map((column) => this.values[column]),
    };
  }
}
