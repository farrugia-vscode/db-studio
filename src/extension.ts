import * as vscode from 'vscode';
import { DriverFactory } from './drivers/driverFactory';
import { ConnectionManager } from './connections/connectionManager';
import { SchemaTreeProvider } from './views/schemaTreeProvider';
import { ConnectionIconProvider } from './views/connectionIconProvider';
import { ConnectionFormView } from './views/connectionFormView';
import { ResultsView } from './views/resultsView';
import { DataGridView } from './views/dataGridView';
import { TableDesignerView } from './views/tableDesignerView';
import { SqlConsoleView } from './views/sqlConsoleView';
import { DDL_SCHEME, DdlContentProvider, buildDdlUri } from './views/ddlContentProvider';
import { SchemaNode } from './views/schemaNode';

let manager: ConnectionManager;
let treeProvider: SchemaTreeProvider;
let formView: ConnectionFormView;
let resultsView: ResultsView;
let dataGridView: DataGridView;
let designerView: TableDesignerView;
let sqlConsoleView: SqlConsoleView;

export function activate(context: vscode.ExtensionContext): void {
  manager = new ConnectionManager(context, new DriverFactory());
  treeProvider = new SchemaTreeProvider(manager, new ConnectionIconProvider(context));
  formView = new ConnectionFormView(context, manager, (name) => {
    treeProvider.refresh();
    dataGridView.updateColor(name);
  });
  resultsView = new ResultsView();
  dataGridView = new DataGridView(context, manager);
  designerView = new TableDesignerView(context, manager, () => treeProvider.refresh());
  sqlConsoleView = new SqlConsoleView(context, manager);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(DDL_SCHEME, new DdlContentProvider(manager)),
    vscode.window.registerTreeDataProvider('dbStudio.explorer', treeProvider),
    vscode.commands.registerCommand('dbStudio.addConnection', () => formView.open()),
    vscode.commands.registerCommand('dbStudio.editConnection', (node?: SchemaNode) => editConnection(node)),
    vscode.commands.registerCommand('dbStudio.removeConnection', (node?: SchemaNode) => removeConnection(node)),
    vscode.commands.registerCommand('dbStudio.refresh', () => treeProvider.refresh()),
    vscode.commands.registerCommand('dbStudio.runQuery', (node?: SchemaNode) => runQuery(node)),
    vscode.commands.registerCommand('dbStudio.openTableData', (node?: SchemaNode) => openTableData(node)),
    vscode.commands.registerCommand('dbStudio.showTableDdl', (node?: SchemaNode) => showTableDdl(node)),
    vscode.commands.registerCommand('dbStudio.emptyTable', (node?: SchemaNode) => emptyTable(node)),
    vscode.commands.registerCommand('dbStudio.dropTable', (node?: SchemaNode) => dropTable(node)),
    vscode.commands.registerCommand('dbStudio.createTable', (node?: SchemaNode) => createTable(node)),
    vscode.commands.registerCommand('dbStudio.modifyTable', (node?: SchemaNode) => modifyTable(node)),
    vscode.commands.registerCommand('dbStudio.createDatabase', (node?: SchemaNode) => createDatabase(node)),
    vscode.commands.registerCommand('dbStudio.dropDatabase', (node?: SchemaNode) => dropDatabase(node)),
    vscode.commands.registerCommand('dbStudio.openSqlConsole', (node?: SchemaNode) => openSqlConsole(node)),
  );
}

async function openSqlConsole(node?: SchemaNode): Promise<void> {
  const name = node ? node.connectionName : await pickConnectionName();
  if (name) {
    sqlConsoleView.open(name);
  }
}

async function dropDatabase(node?: SchemaNode): Promise<void> {
  if (!node || node.kind !== 'namespace' || !node.namespace) {
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
  if (!name) {
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
  if (!node || node.kind !== 'namespace' || !node.namespace) {
    return;
  }
  await designerView.open({ connectionName: node.connectionName, namespace: node.namespace });
}

async function modifyTable(node?: SchemaNode): Promise<void> {
  if (!node || node.kind !== 'table' || !node.namespace || !node.table) {
    return;
  }
  await designerView.open({ connectionName: node.connectionName, namespace: node.namespace, table: node.table });
}

export async function deactivate(): Promise<void> {
  if (manager) {
    await manager.closeAll();
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

async function runQuery(node?: SchemaNode): Promise<void> {
  const name = node ? node.connectionName : await pickConnectionName();
  if (!name) {
    return;
  }
  const sql = await resolveSql();
  if (!sql) {
    return;
  }
  try {
    const driver = await manager.getDriver(name);
    const result = await driver.query(sql);
    resultsView.show(`Query · ${name}`, result, manager.getConnection(name)?.color);
  } catch (error) {
    reportError(error);
  }
}

async function openTableData(node?: SchemaNode): Promise<void> {
  if (!node || node.kind !== 'table' || !node.namespace || !node.table) {
    return;
  }
  await dataGridView.open({
    connectionName: node.connectionName,
    namespace: node.namespace,
    table: node.table,
  });
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

async function resolveSql(): Promise<string | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (editor && !editor.selection.isEmpty) {
    return editor.document.getText(editor.selection);
  }
  if (editor && editor.document.languageId === 'sql') {
    return editor.document.getText();
  }
  return vscode.window.showInputBox({ prompt: 'SQL query', ignoreFocusOut: true });
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
