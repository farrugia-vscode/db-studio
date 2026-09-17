import * as vscode from 'vscode';
import { DriverFactory } from './drivers/driverFactory';
import { ConnectionManager } from './connections/connectionManager';
import { SchemaTreeProvider } from './views/schemaTreeProvider';
import { ConnectionFormView } from './views/connectionFormView';
import { DataGridView } from './views/dataGridView';
import { TableDesignerView } from './views/tableDesignerView';
import { SqlConsoleView } from './views/sqlConsoleView';
import { QueryHistory } from './views/queryHistory';
import { ExportService } from './views/exportService';
import type { ExportFormat } from './domain/exportFormat';
import { DDL_SCHEME, DdlContentProvider, buildDdlUri, buildObjectDdlUri } from './views/ddlContentProvider';
import { SchemaNode } from './views/schemaNode';
import { getConnectionIcon } from './views/connectionIcon';
import { VISIBLE_PREFIX, VISIBLE_CONNECTIONS_KEY } from './views/schemaTreeProvider';

let manager: ConnectionManager;
let treeProvider: SchemaTreeProvider;
let formView: ConnectionFormView;
let dataGridView: DataGridView;
let designerView: TableDesignerView;
let sqlConsoleView: SqlConsoleView;
let exportService: ExportService;
let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;
  manager = new ConnectionManager(context, new DriverFactory());
  void manager.clearGlobalConnections();
  treeProvider = new SchemaTreeProvider(manager, context);
  formView = new ConnectionFormView(context, manager, () => {
    treeProvider.refresh();
  });
  const queryHistory = new QueryHistory(context);
  dataGridView = new DataGridView(context, manager, queryHistory);
  designerView = new TableDesignerView(context, manager, () => treeProvider.refresh());
  sqlConsoleView = new SqlConsoleView(context, manager, queryHistory);
  exportService = new ExportService(manager);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(DDL_SCHEME, new DdlContentProvider(manager)),
    vscode.window.registerTreeDataProvider('dbStudio.explorer', treeProvider),
    vscode.commands.registerCommand('dbStudio.addConnection', () => formView.open()),
    vscode.commands.registerCommand('dbStudio.editConnection', (node?: SchemaNode) => editConnection(node)),
    vscode.commands.registerCommand('dbStudio.removeConnection', (node?: SchemaNode) => removeConnection(node)),
    vscode.commands.registerCommand('dbStudio.refresh', () => treeProvider.refresh()),
    vscode.commands.registerCommand('dbStudio.refreshNode', (node?: SchemaNode) => treeProvider.refresh(node)),
    vscode.commands.registerCommand('dbStudio.copyName', (node?: SchemaNode) => copyName(node)),
    vscode.commands.registerCommand('dbStudio.copyDdl', (node?: SchemaNode) => copyDdl(node)),
    vscode.commands.registerCommand('dbStudio.openTableData', (node?: SchemaNode) => openTableData(node)),
    vscode.commands.registerCommand('dbStudio.showTableDdl', (node?: SchemaNode) => showTableDdl(node)),
    vscode.commands.registerCommand('dbStudio.showObjectDdl', (node?: SchemaNode) => showObjectDdl(node)),
    vscode.commands.registerCommand('dbStudio.emptyTable', (node?: SchemaNode) => emptyTable(node)),
    vscode.commands.registerCommand('dbStudio.dropTable', (node?: SchemaNode) => dropTable(node)),
    vscode.commands.registerCommand('dbStudio.createTable', (node?: SchemaNode) => createTable(node)),
    vscode.commands.registerCommand('dbStudio.modifyTable', (node?: SchemaNode) => modifyTable(node)),
    vscode.commands.registerCommand('dbStudio.createDatabase', (node?: SchemaNode) => createDatabase(node)),
    vscode.commands.registerCommand('dbStudio.dropDatabase', (node?: SchemaNode) => dropDatabase(node)),
    vscode.commands.registerCommand('dbStudio.openSqlConsole', (node?: SchemaNode) => openSqlConsole(node)),
    vscode.commands.registerCommand('dbStudio.exportTable', (node?: SchemaNode) => exportTable(node)),
    vscode.commands.registerCommand('dbStudio.duplicateConnection', (node?: SchemaNode) => duplicateConnection(node)),
    vscode.commands.registerCommand('dbStudio.findTable', (node?: SchemaNode) => findTable(node)),
    vscode.commands.registerCommand('dbStudio.selectDatabases', (node?: SchemaNode) => selectDatabases(node)),
    vscode.commands.registerCommand('dbStudio.selectConnections', () => selectConnections()),
  );
}

/** Choose which connections are shown in the tree (empty selection = all). */
async function selectConnections(): Promise<void> {
  const connections = manager.getConnections();
  if (connections.length === 0) {
    vscode.window.showWarningMessage('No connection configured. Run "DB Studio: Add Connection" first.');
    return;
  }
  const stored = extensionContext.workspaceState.get<string[]>(VISIBLE_CONNECTIONS_KEY, []);
  const picked = await vscode.window.showQuickPick(
    connections.map((connection) => ({
      label: connection.name,
      iconPath: getConnectionIcon(connection),
      description: `${connection.driver}`,
      connectionName: connection.name,
      picked: stored.length === 0 || stored.includes(connection.name),
    })),
    { canPickMany: true, placeHolder: 'Connections to show (none selected = show all)' },
  );
  if (picked === undefined) {
    return;
  }
  // Selecting every connection is equivalent to "show all" → store an empty list.
  const selection = picked.length === connections.length ? [] : picked.map((item) => item.connectionName);
  await extensionContext.workspaceState.update(VISIBLE_CONNECTIONS_KEY, selection);
  treeProvider.refresh();
}

async function openSqlConsole(node?: SchemaNode): Promise<void> {
  const name = node ? node.connectionName : await pickConnectionName();
  if (name) {
    sqlConsoleView.open(name, node?.kind === 'namespace' ? node.namespace : undefined);
  }
}

async function dropDatabase(node?: SchemaNode): Promise<void> {
  if (!node || node.kind !== 'namespace' || !node.namespace) {
    return;
  }
  if (blockedByReadOnly(node.connectionName)) {
    return;
  }
  const confirmed = await vscode.window.showWarningMessage(
    `Drop "${node.namespace}"? All its tables and data are removed — this cannot be undone.`,
    { modal: true },
    'Drop',
  );
  if (confirmed !== 'Drop') {
    return;
  }
  try {
    const driver = await manager.getDriver(node.connectionName);
    await driver.query(driver.buildDropNamespace(node.namespace));
    treeProvider.refresh();
    vscode.window.showInformationMessage(`DB Studio: "${node.namespace}" dropped.`);
  } catch (error) {
    reportError(error);
  }
}

async function createDatabase(node?: SchemaNode): Promise<void> {
  const name = node ? node.connectionName : await pickConnectionName();
  if (!name || blockedByReadOnly(name)) {
    return;
  }
  const dbName = await vscode.window.showInputBox({ prompt: 'New database / schema name', ignoreFocusOut: true });
  if (!dbName) {
    return;
  }
  try {
    const driver = await manager.getDriver(name);
    await driver.query(driver.buildCreateNamespace(dbName));
    treeProvider.refresh();
    vscode.window.showInformationMessage(`DB Studio: "${dbName}" created.`);
  } catch (error) {
    reportError(error);
  }
}

async function createTable(node?: SchemaNode): Promise<void> {
  if (!node || node.kind !== 'namespace' || !node.namespace || blockedByReadOnly(node.connectionName)) {
    return;
  }
  await designerView.open({ connectionName: node.connectionName, namespace: node.namespace });
}

async function modifyTable(node?: SchemaNode): Promise<void> {
  if (!node || node.kind !== 'table' || !node.namespace || !node.table || blockedByReadOnly(node.connectionName)) {
    return;
  }
  await designerView.open({ connectionName: node.connectionName, namespace: node.namespace, table: node.table });
}

export async function deactivate(): Promise<void> {
  if (manager) {
    await manager.closeAll();
  }
}

/** Choose which databases/schemas of a connection are shown in the tree (empty selection = all). */
async function selectDatabases(node?: SchemaNode): Promise<void> {
  const name = node ? node.connectionName : await pickConnectionName();
  if (!name) {
    return;
  }
  try {
    const driver = await manager.getDriver(name);
    const all = await driver.listNamespaces();
    const stored = extensionContext.workspaceState.get<string[]>(VISIBLE_PREFIX + name, []);
    const picked = await vscode.window.showQuickPick(
      all.map((namespace) => ({ label: namespace, picked: stored.length === 0 || stored.includes(namespace) })),
      { canPickMany: true, placeHolder: 'Databases to show (none selected = show all)' },
    );
    if (picked === undefined) {
      return;
    }
    // Selecting every database is equivalent to "show all" → store an empty list.
    const selection = picked.length === all.length ? [] : picked.map((item) => item.label);
    await extensionContext.workspaceState.update(VISIBLE_PREFIX + name, selection);
    treeProvider.refresh();
  } catch (error) {
    reportError(error);
  }
}

async function duplicateConnection(node?: SchemaNode): Promise<void> {
  const name = node ? node.connectionName : await pickConnectionName();
  if (!name) {
    return;
  }
  const created = await manager.duplicateConnection(name);
  if (created) {
    treeProvider.refresh();
    vscode.window.showInformationMessage(`DB Studio: duplicated "${name}" as "${created}".`);
  }
}

/** "Go to table": fuzzy-pick any table or view across the connection's schemas, then open it. */
async function findTable(node?: SchemaNode): Promise<void> {
  const name = node ? node.connectionName : await pickConnectionName();
  if (!name) {
    return;
  }
  try {
    const driver = await manager.getDriver(name);
    const namespaces = await driver.listNamespaces();
    const items: Array<vscode.QuickPickItem & { namespace: string; table: string }> = [];
    for (const namespace of namespaces) {
      const [tables, views] = await Promise.all([driver.listTables(namespace), driver.listViews(namespace)]);
      for (const table of tables) {
        items.push({ label: `$(table) ${table}`, description: namespace, namespace, table });
      }
      for (const view of views) {
        items.push({ label: `$(eye) ${view}`, description: namespace, namespace, table: view });
      }
    }
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `Find a table or view in "${name}"`,
      matchOnDescription: true,
    });
    if (!picked) {
      return;
    }
    await dataGridView.open({ connectionName: name, namespace: picked.namespace, table: picked.table });
  } catch (error) {
    reportError(error);
  }
}

async function editConnection(node?: SchemaNode): Promise<void> {
  const name = node ? node.connectionName : await pickConnectionName();
  if (!name) {
    return;
  }
  const connection = manager.getConnection(name);
  if (!connection) {
    return;
  }
  formView.open(connection);
}

async function removeConnection(node?: SchemaNode): Promise<void> {
  const name = node ? node.connectionName : await pickConnectionName();
  if (!name) {
    return;
  }
  const confirmed = await vscode.window.showWarningMessage(`Remove connection "${name}"?`, { modal: true }, 'Remove');
  if (confirmed !== 'Remove') {
    return;
  }
  await manager.removeConnection(name);
  treeProvider.refresh();
}

// "Run SQL Query" opens the full console; from a schema node it preselects that schema.
async function openTableData(node?: SchemaNode): Promise<void> {
  // Tables and views both open in the data grid (a view lands read-only: no primary key).
  const isTable = node?.kind === 'table';
  const isView = node?.kind === 'object' && node.objectKind === 'view';
  if (!node || (!isTable && !isView) || !node.namespace || !node.table) {
    return;
  }
  await dataGridView.open({
    connectionName: node.connectionName,
    namespace: node.namespace,
    table: node.table,
  });
}

async function showObjectDdl(node?: SchemaNode): Promise<void> {
  if (!node || node.kind !== 'object' || !node.namespace || !node.table || !node.objectKind) {
    return;
  }
  try {
    const document = await vscode.workspace.openTextDocument(
      buildObjectDdlUri(node.connectionName, node.namespace, node.table, node.objectKind),
    );
    await vscode.languages.setTextDocumentLanguage(document, 'sql');
    await vscode.window.showTextDocument(document, { preview: true });
  } catch (error) {
    reportError(error);
  }
}

// The bare identifier: table/object/namespace name, or the column/index/key name for a field.
async function copyName(node?: SchemaNode): Promise<void> {
  if (!node) {
    return;
  }
  const name = typeof node.label === 'string' ? node.label : (node.label?.label ?? '');
  await vscode.env.clipboard.writeText(name);
  vscode.window.setStatusBarMessage(`DB Studio: copied "${name}"`, 2000);
}

async function copyDdl(node?: SchemaNode): Promise<void> {
  if (!node || !node.namespace || !node.table) {
    return;
  }
  try {
    const driver = await manager.getDriver(node.connectionName);
    const ddl =
      node.kind === 'object' && node.objectKind
        ? await driver.getObjectDdl(node.namespace, node.objectKind, node.table)
        : await driver.getTableDdl(node.namespace, node.table);
    await vscode.env.clipboard.writeText(ddl);
    vscode.window.setStatusBarMessage(`DB Studio: DDL of ${node.table} copied`, 2000);
  } catch (error) {
    reportError(error);
  }
}

async function showTableDdl(node?: SchemaNode): Promise<void> {
  if (!node || node.kind !== 'table' || !node.namespace || !node.table) {
    return;
  }
  try {
    const document = await vscode.workspace.openTextDocument(
      buildDdlUri(node.connectionName, node.namespace, node.table),
    );
    await vscode.languages.setTextDocumentLanguage(document, 'sql');
    await vscode.window.showTextDocument(document, { preview: true });
  } catch (error) {
    reportError(error);
  }
}

async function exportTable(node?: SchemaNode): Promise<void> {
  const isTable = node?.kind === 'table';
  const isView = node?.kind === 'object' && node.objectKind === 'view';
  if (!node || (!isTable && !isView) || !node.namespace || !node.table) {
    return;
  }
  const picked = await vscode.window.showQuickPick(
    [
      { label: 'CSV', format: 'csv' as ExportFormat },
      { label: 'JSON', format: 'json' as ExportFormat },
      { label: 'SQL (INSERT statements)', format: 'sql' as ExportFormat },
    ],
    { placeHolder: `Export "${node.table}" as…` },
  );
  if (!picked) {
    return;
  }
  try {
    await exportService.exportTable(
      { connectionName: node.connectionName, namespace: node.namespace, table: node.table },
      picked.format,
    );
  } catch (error) {
    reportError(error);
  }
}

async function emptyTable(node?: SchemaNode): Promise<void> {
  if (!node || node.kind !== 'table' || !node.namespace || !node.table) {
    return;
  }
  const confirmed = await vscode.window.showWarningMessage(
    `Empty table "${node.table}"? All rows will be deleted — this cannot be undone.`,
    { modal: true },
    'Empty',
  );
  if (confirmed !== 'Empty') {
    return;
  }
  await runTableStatement(node, (ref) => `TRUNCATE TABLE ${ref}`, `Table "${node.table}" emptied.`);
}

async function dropTable(node?: SchemaNode): Promise<void> {
  if (!node || node.kind !== 'table' || !node.namespace || !node.table) {
    return;
  }
  const confirmed = await vscode.window.showWarningMessage(
    `Drop table "${node.table}"? The table and its data are removed — this cannot be undone.`,
    { modal: true },
    'Drop',
  );
  if (confirmed !== 'Drop') {
    return;
  }
  await runTableStatement(node, (ref) => `DROP TABLE ${ref}`, `Table "${node.table}" dropped.`);
}

async function runTableStatement(
  node: SchemaNode,
  buildSql: (ref: string) => string,
  successMessage: string,
): Promise<void> {
  if (blockedByReadOnly(node.connectionName)) {
    return;
  }
  try {
    const driver = await manager.getDriver(node.connectionName);
    const ref = driver.buildTableRef(node.namespace!, node.table!);
    await driver.query(buildSql(ref));
    treeProvider.refresh();
    vscode.window.showInformationMessage(`DB Studio: ${successMessage}`);
  } catch (error) {
    reportError(error);
  }
}

async function pickConnectionName(): Promise<string | undefined> {
  const names = manager.getConnections().map((connection) => connection.name);
  if (names.length === 0) {
    vscode.window.showWarningMessage('No connection configured. Run "DB Studio: Add Connection" first.');
    return undefined;
  }
  if (names.length === 1) {
    return names[0];
  }
  return vscode.window.showQuickPick(names, { placeHolder: 'Connection' });
}

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  vscode.window.showErrorMessage(`DB Studio: ${message}`);
}

// Guard for write actions: warns and returns true when the connection is marked read-only.
function blockedByReadOnly(connectionName: string): boolean {
  if (manager.getConnection(connectionName)?.isReadOnly) {
    vscode.window.showWarningMessage(`DB Studio: "${connectionName}" is read-only; the action was blocked.`);
    return true;
  }
  return false;
}
