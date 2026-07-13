import * as vscode from 'vscode';
import { DriverFactory } from './drivers/driverFactory';
import { ConnectionManager } from './connections/connectionManager';
import { SchemaTreeProvider } from './views/schemaTreeProvider';
import { ConnectionIconProvider } from './views/connectionIconProvider';
import { ConnectionFormView } from './views/connectionFormView';
import { ResultsView } from './views/resultsView';
import { DataGridView } from './views/dataGridView';
import { SchemaNode } from './views/schemaNode';

let manager: ConnectionManager;
let treeProvider: SchemaTreeProvider;
let formView: ConnectionFormView;
let resultsView: ResultsView;
let dataGridView: DataGridView;

export function activate(context: vscode.ExtensionContext): void {
  manager = new ConnectionManager(context, new DriverFactory());
  treeProvider = new SchemaTreeProvider(manager, new ConnectionIconProvider(context));
  formView = new ConnectionFormView(context, manager, (name) => {
    treeProvider.refresh();
    dataGridView.updateColor(name);
  });
  resultsView = new ResultsView();
  dataGridView = new DataGridView(context, manager);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('dbStudio.explorer', treeProvider),
    vscode.commands.registerCommand('dbStudio.addConnection', () => formView.open()),
    vscode.commands.registerCommand('dbStudio.editConnection', (node?: SchemaNode) => editConnection(node)),
    vscode.commands.registerCommand('dbStudio.removeConnection', (node?: SchemaNode) => removeConnection(node)),
    vscode.commands.registerCommand('dbStudio.refresh', () => treeProvider.refresh()),
    vscode.commands.registerCommand('dbStudio.runQuery', (node?: SchemaNode) => runQuery(node)),
    vscode.commands.registerCommand('dbStudio.openTableData', (node?: SchemaNode) => openTableData(node)),
  );
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
