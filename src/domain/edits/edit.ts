import type { SqlDialect } from '../driver';
import type { Row, SqlStatement } from '../types';

/**
 * An edit is a Command: it knows how to turn itself into a parameterized
 * statement for a given dialect. Adding a new edit kind means adding a class,
 * never touching a switch (OCP).
 */
export interface Edit {
  toStatement(dialect: SqlDialect, tableRef: string): SqlStatement;
}

/** Plain-object shape exchanged with the webview (no behaviour). */
export type EditDto =
  | { op: 'update'; pk: Row; set: Row }
  | { op: 'delete'; pk: Row }
  | { op: 'insert'; values: Row };
