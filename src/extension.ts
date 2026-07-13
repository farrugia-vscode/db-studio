import * as vscode from 'vscode';
import { DriverFactory } from './drivers/driverFactory';
import { ConnectionManager } from './connections/connectionManager';
import { SchemaTreeProvider } from './views/schemaTreeProvider';
import { ResultsView } from './views/resultsView';
import { DataGridView } from './views/dataGridView';
import { SchemaNode } from './views/schemaNode';
import type { ConnectionConfig, DriverKind } from './domain/types';

let manager: ConnectionManager;
let treeProvider: SchemaTreeProvider;
let resultsView: ResultsView;
let dataGridView: DataGridView;

export function activate(context: vscode.ExtensionContext): void {
  manager = new ConnectionManager(context, new DriverFactory());
  treeProvider = new SchemaTreeProvider(manager);
  resultsView = new ResultsView();
  dataGridView = new DataGridView(context, manager);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('dbStudio.explorer', treeProvider),
    vscode.commands.registerCommand('dbStudio.addConnection', () => addConnection()),
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

async function addConnection(): Promise<void> {
  const name = await vscode.window.showInputBox({ prompt: 'Connection name', ignoreFocusOut: true });
  if (!name) {
    return;
  }
  const driver = await vscode.window.showQuickPick(
    [
      { label: 'MySQL / MariaDB', value: 'mysql' as DriverKind },
      { label: 'PostgreSQL', value: 'postgres' as DriverKind },
    ],
    { placeHolder: 'Driver', ignoreFocusOut: true },
  );
  if (!driver) {
    return;
  }
  const host = await vscode.window.showInputBox({ prompt: 'Host', value: '127.0.0.1', ignoreFocusOut: true });
  if (host === undefined) {
    return;
  }
  const defaultPort = driver.value === 'mysql' ? '3306' : '5432';
  const portInput = await vscode.window.showInputBox({ prompt: 'Port', value: defaultPort, ignoreFocusOut: true });
  if (portInput === undefined) {
    return;
  }
  const user = await vscode.window.showInputBox({ prompt: 'User', ignoreFocusOut: true });
  if (user === undefined) {
    return;
  }
  const database = await vscode.window.showInputBox({
    prompt: driver.value === 'postgres' ? 'Database (required for PostgreSQL)' : 'Default database (optional)',
    ignoreFocusOut: true,
  });
  if (database === undefined) {
    return;
  }
  const password = await vscode.window.showInputBox({ prompt: 'Password', password: true, ignoreFocusOut: true });
  if (password === undefined) {
    return;
  }

  const config: ConnectionConfig = {
    name,
    driver: driver.value,
    host,
    port: Number(portInput),
    user,
    database: database || undefined,
  };
  await manager.saveConnection(config, password);
  treeProvider.refresh();
  vscode.window.showInformationMessage(`Connection "${name}" saved.`);
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
    resultsView.show(`Query · ${name}`, result);
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
