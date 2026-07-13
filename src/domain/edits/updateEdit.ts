import type { Edit } from './edit';
import type { SqlDialect } from '../driver';
import type { Row, SqlStatement } from '../types';

/** UPDATE ... SET ... WHERE <primary key>. */
export class UpdateEdit implements Edit {
  constructor(
    private readonly primaryKey: Row,
    private readonly changes: Row,
  ) {}

  toStatement(dialect: SqlDialect, tableRef: string): SqlStatement {
    const changeColumns = Object.keys(this.changes);
    const pkColumns = Object.keys(this.primaryKey);
    const sets = changeColumns.map(
      (column, index) => `${dialect.quoteIdentifier(column)} = ${dialect.placeholder(index + 1)}`,
    );
    const wheres = pkColumns.map(
      (column, index) => `${dialect.quoteIdentifier(column)} = ${dialect.placeholder(changeColumns.length + index + 1)}`,
    );
    return {
      sql: `UPDATE ${tableRef} SET ${sets.join(', ')} WHERE ${wheres.join(' AND ')}`,
      params: [...changeColumns.map((column) => this.changes[column]), ...pkColumns.map((column) => this.primaryKey[column])],
    };
  }
}
