import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connectionManager';
import { ConnectionIconProvider } from './connectionIconProvider';
import { SchemaNode } from './schemaNode';

const Collapsed = vscode.TreeItemCollapsibleState.Collapsed;

/**
 * Lazily builds the schema tree: connection → namespace → table → column.
 * Depends only on {@link ConnectionManager} to resolve a driver per connection.
 */
export class SchemaTreeProvider implements vscode.TreeDataProvider<SchemaNode> {
  private readonly emitter = new vscode.EventEmitter<SchemaNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly manager: ConnectionManager,
    private readonly icons: ConnectionIconProvider,
  ) {}

  refresh(): void {
    this.emitter.fire(undefined);
  }

  getTreeItem(node: SchemaNode): vscode.TreeItem {
    return node;
  }

  getChildren(node?: SchemaNode): Promise<SchemaNode[]> {
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
    return Promise.resolve([]);
  }

  private async buildConnectionNodes(): Promise<SchemaNode[]> {
    const connections = this.manager.getConnections();
    return Promise.all(
      connections.map(async (connection) => {
        const node = new SchemaNode('connection', connection.name, Collapsed, connection.name);
        node.description = `${connection.driver} · ${connection.host}`;
        node.iconPath = await this.icons.connectionIcon(connection.color);
        return node;
      }),
    );
  }

  private async buildNamespaceNodes(parent: SchemaNode): Promise<SchemaNode[]> {
    const driver = await this.manager.getDriver(parent.connectionName);
    const namespaces = await driver.listNamespaces();
    return namespaces.map((namespace) => {
      const node = new SchemaNode('namespace', namespace, Collapsed, parent.connectionName, namespace);
      node.iconPath = new vscode.ThemeIcon('symbol-namespace');
      return node;
    });
  }

  private async buildTableNodes(parent: SchemaNode): Promise<SchemaNode[]> {
    const driver = await this.manager.getDriver(parent.connectionName);
    const tables = await driver.listTables(parent.namespace!);
    const color = this.manager.getConnection(parent.connectionName)?.color;
    const tableIcon = await this.icons.tableIcon(color);
    return tables.map((table) => {
      const node = new SchemaNode('table', table, Collapsed, parent.connectionName, parent.namespace, table);
      node.iconPath = tableIcon;
      // Open the data grid when the table row is activated (honors the user's single/double-click mode).
      node.command = { command: 'dbStudio.openTableData', title: 'Open Table Data', arguments: [node] };
      return node;
    });
  }

  private async buildColumnNodes(parent: SchemaNode): Promise<SchemaNode[]> {
    const driver = await this.manager.getDriver(parent.connectionName);
    const columns = await driver.listColumns(parent.namespace!, parent.table!);
    return columns.map((column) => {
      const node = new SchemaNode(
        'column',
        column.name,
        vscode.TreeItemCollapsibleState.None,
        parent.connectionName,
        parent.namespace,
        parent.table,
      );
      node.description = `${column.type} · ${column.isNullable ? 'null' : 'not null'}`;
      node.iconPath = new vscode.ThemeIcon(column.isPrimaryKey ? 'key' : 'symbol-field');
      return node;
    });
  }
}
