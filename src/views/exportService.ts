import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connectionManager';
import { type ExportFormat, toCsv, toJson, toSqlInserts } from '../domain/exportFormat';
import type { TableTarget } from './dataGridView';

const EXTENSIONS: Record<ExportFormat, string> = { csv: 'csv', json: 'json', sql: 'sql' };
const FILTERS: Record<ExportFormat, string> = { csv: 'CSV', json: 'JSON', sql: 'SQL' };

/** Exports a whole table's rows to a file in the chosen format (CSV / JSON / SQL inserts). */
export class ExportService {
  constructor(private readonly manager: ConnectionManager) {}

  async exportTable(target: TableTarget, format: ExportFormat): Promise<void> {
    const driver = await this.manager.getDriver(target.connectionName);
    const ref = driver.buildTableRef(target.namespace, target.table);
    const result = await driver.query(`SELECT * FROM ${ref}`);

    const content =
      format === 'csv'
        ? toCsv(result.columns, result.rows)
        : format === 'json'
          ? toJson(result.columns, result.rows)
          : toSqlInserts(ref, (identifier) => driver.quoteIdentifier(identifier), result.columns, result.rows);

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`${target.table}.${EXTENSIONS[format]}`),
      filters: { [FILTERS[format]]: [EXTENSIONS[format]] },
    });
    if (!uri) {
      return;
    }
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    vscode.window.showInformationMessage(`DB Studio: exported ${result.rows.length} row(s) to ${uri.fsPath}`);
  }
}
