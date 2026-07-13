const vscode = require('vscode');
const { ConnectionManager } = require('./src/connections/manager');
const { SchemaTreeProvider } = require('./src/schemaTree');
const { ResultsView } = require('./src/resultsView');

let manager;
let treeProvider;
let resultsView;

function activate(context) {
  manager = new ConnectionManager(context);
  treeProvider = new SchemaTreeProvider(manager);
  resultsView = new ResultsView();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('dbStudio.explorer', treeProvider),
    vscode.commands.registerCommand('dbStudio.addConnection', addConnection),
    vscode.commands.registerCommand('dbStudio.removeConnection', removeConnection),
    vscode.commands.registerCommand('dbStudio.refresh', () => treeProvider.refresh()),
    vscode.commands.registerCommand('dbStudio.runQuery', runQuery),
    vscode.commands.registerCommand('dbStudio.openTableData', openTableData),
  );
}

async function addConnection() {
  const name = await vscode.window.showInputBox({ prompt: 'Connection name', ignoreFocusOut: true });
  if (!name) {
    return;
  }
  const driver = await vscode.window.showQuickPick(
    [
      { label: 'MySQL / MariaDB', value: 'mysql' },
      { label: 'PostgreSQL', value: 'postgres' },
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

  await manager.saveConnection(
    {
      name,
      driver: driver.value,
      host,
      port: Number(portInput),
      user,
      database: database || undefined,
    },
    password,
  );
  treeProvider.refresh();
  vscode.window.showInformationMessage(`Connection "${name}" saved.`);
}

async function removeConnection(node) {
  const name = node ? node.connectionName : await pickConnectionName();
  if (!name) {
    return;
  }
  const confirmed = await vscode.window.showWarningMessage(
    `Remove connection "${name}"?`,
    { modal: true },
    'Remove',
  );
  if (confirmed !== 'Remove') {
    return;
  }
  await manager.removeConnection(name);
  treeProvider.refresh();
}

async function runQuery(node) {
  const name = node ? node.connectionName : await pickConnectionName();
  if (!name) {
    return;
  }
  const sql = await resolveSql();
  if (!sql) {
    return;
  }
  await execute(name, sql, `Query · ${name}`);
}

async function openTableData(node) {
  if (!node || node.kind !== 'table') {
    return;
  }
  const driver = await manager.getDriver(node.connectionName);
  const limit = vscode.workspace.getConfiguration('dbStudio').get('rowLimit', 200);
  const sql = `SELECT * FROM ${driver.buildTableRef(node.namespace, node.table)} LIMIT ${limit}`;
  await execute(node.connectionName, sql, `${node.table} · ${node.connectionName}`);
}

async function execute(connectionName, sql, title) {
  try {
    const driver = await manager.getDriver(connectionName);
    const result = await driver.query(sql);
    resultsView.show(title, result);
  } catch (error) {
    vscode.window.showErrorMessage(`DB Studio: ${error.message}`);
  }
}

async function resolveSql() {
  const editor = vscode.window.activeTextEditor;
  if (editor && !editor.selection.isEmpty) {
    return editor.document.getText(editor.selection);
  }
  if (editor && editor.document.languageId === 'sql') {
    return editor.document.getText();
  }
  return vscode.window.showInputBox({ prompt: 'SQL query', ignoreFocusOut: true });
}

async function pickConnectionName() {
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

async function deactivate() {
  if (manager) {
    await manager.closeAll();
  }
}

module.exports = { activate, deactivate };
