const vscode = require('vscode');

/**
 * Tree structure: connection -> namespace (database/schema) -> table -> column.
 * Children are fetched lazily when a node is expanded.
 */
class SchemaTreeProvider {
  constructor(manager) {
    this.manager = manager;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(node) {
    return node;
  }

  async getChildren(node) {
    if (!node) {
      return this.buildConnectionNodes();
    }
    if (node.kind === 'connection') {
      return this.buildNamespaceNodes(node);
    }
    if (node.kind === 'namespace') {
      return this.buildTableNodes(node);
    }
    if (node.kind === 'table') {
      return this.buildColumnNodes(node);
    }
    return [];
  }

  buildConnectionNodes() {
    return this.manager.getConnections().map((connection) => {
      const node = new vscode.TreeItem(connection.name, vscode.TreeItemCollapsibleState.Collapsed);
      node.kind = 'connection';
      node.connectionName = connection.name;
      node.contextValue = 'connection';
      node.description = `${connection.driver} · ${connection.host}`;
      node.iconPath = new vscode.ThemeIcon('database');
      return node;
    });
  }

  async buildNamespaceNodes(parent) {
    const driver = await this.manager.getDriver(parent.connectionName);
    const namespaces = await driver.listNamespaces();
    return namespaces.map((namespace) => {
      const node = new vscode.TreeItem(namespace, vscode.TreeItemCollapsibleState.Collapsed);
      node.kind = 'namespace';
      node.connectionName = parent.connectionName;
      node.namespace = namespace;
      node.contextValue = 'namespace';
      node.iconPath = new vscode.ThemeIcon('symbol-namespace');
      return node;
    });
  }

  async buildTableNodes(parent) {
    const driver = await this.manager.getDriver(parent.connectionName);
    const tables = await driver.listTables(parent.namespace);
    return tables.map((table) => {
      const node = new vscode.TreeItem(table, vscode.TreeItemCollapsibleState.Collapsed);
      node.kind = 'table';
      node.connectionName = parent.connectionName;
      node.namespace = parent.namespace;
      node.table = table;
      node.contextValue = 'table';
      node.iconPath = new vscode.ThemeIcon('table');
      return node;
    });
  }

  async buildColumnNodes(parent) {
    const driver = await this.manager.getDriver(parent.connectionName);
    const columns = await driver.listColumns(parent.namespace, parent.table);
    return columns.map((column) => {
      const node = new vscode.TreeItem(column.name, vscode.TreeItemCollapsibleState.None);
      node.kind = 'column';
      const nullable = column.isNullable ? 'null' : 'not null';
      node.description = `${column.type} · ${nullable}`;
      node.iconPath = new vscode.ThemeIcon(column.isPrimaryKey ? 'key' : 'symbol-field');
      return node;
    });
  }
}

module.exports = { SchemaTreeProvider };
