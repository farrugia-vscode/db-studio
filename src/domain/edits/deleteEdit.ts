import type { Edit } from './edit';
import type { SqlDialect } from '../driver';
import type { Row, SqlStatement } from '../types';

/** DELETE FROM ... WHERE <primary key>. */
export class DeleteEdit implements Edit {
  constructor(private readonly primaryKey: Row) {}

  toStatement(dialect: SqlDialect, tableRef: string): SqlStatement {
    const pkColumns = Object.keys(this.primaryKey);
    const wheres = pkColumns.map(
      (column, index) => `${dialect.quoteIdentifier(column)} = ${dialect.placeholder(index + 1)}`,
    );
    return {
      sql: `DELETE FROM ${tableRef} WHERE ${wheres.join(' AND ')}`,
      params: pkColumns.map((column) => this.primaryKey[column]),
    };
  }
}
