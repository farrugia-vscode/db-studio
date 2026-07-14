import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connectionManager';

export const DDL_SCHEME = 'dbstudio-ddl';

/** Read-only virtual URI for a table's DDL — no dirty state, no save prompt. */
export function buildDdlUri(connectionName: string, namespace: string, table: string): vscode.Uri {
  const query = new URLSearchParams({ connection: connectionName, namespace, table }).toString();
  return vscode.Uri.from({ scheme: DDL_SCHEME, path: `/${table}.sql`, query });
}

export class DdlContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly manager: ConnectionManager) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const params = new URLSearchParams(uri.query);
    const driver = await this.manager.getDriver(params.get('connection') ?? '');
    return driver.getTableDdl(params.get('namespace') ?? '', params.get('table') ?? '');
  }
}
