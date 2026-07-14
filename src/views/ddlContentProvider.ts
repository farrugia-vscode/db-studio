import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connectionManager';
import type { SchemaObjectKind } from '../domain/types';

export const DDL_SCHEME = 'dbstudio-ddl';

/** Read-only virtual URI for a table's DDL — no dirty state, no save prompt. */
export function buildDdlUri(connectionName: string, namespace: string, table: string): vscode.Uri {
  const query = new URLSearchParams({ connection: connectionName, namespace, table }).toString();
  return vscode.Uri.from({ scheme: DDL_SCHEME, path: `/${table}.sql`, query });
}

/** Read-only virtual URI for a non-table object's definition (view, routine, trigger, sequence). */
export function buildObjectDdlUri(
  connectionName: string,
  namespace: string,
  name: string,
  kind: SchemaObjectKind,
): vscode.Uri {
  const query = new URLSearchParams({ connection: connectionName, namespace, table: name, kind }).toString();
  return vscode.Uri.from({ scheme: DDL_SCHEME, path: `/${name}.sql`, query });
}

export class DdlContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly manager: ConnectionManager) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const params = new URLSearchParams(uri.query);
    const driver = await this.manager.getDriver(params.get('connection') ?? '');
    const namespace = params.get('namespace') ?? '';
    const name = params.get('table') ?? '';
    const kind = params.get('kind') as SchemaObjectKind | null;
    return kind ? driver.getObjectDdl(namespace, kind, name) : driver.getTableDdl(namespace, name);
  }
}
