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
    return Promise.resolve([]);
  }

  private async buildConnectionNodes(): Promise<SchemaNode[]> {
    const connections = this.manager.getConnections();
    return Promise.all(
      connections.map(async (connection) => {
        const label = connection.icon ? `${connection.icon} ${connection.name}` : connection.name;
        const node = new SchemaNode('connection', label, Collapsed, connection.name);
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
    return tables.map((table) => {
      const node = new SchemaNode('table', table, Collapsed, parent.connectionName, parent.namespace, table);
      node.iconPath = new vscode.ThemeIcon('table');
      // Open the data grid when the table row is activated (honors the user's single/double-click mode).
      node.command = { command: 'dbStudio.openTableData', title: 'Open Table Data', arguments: [node] };
      return node;
    });
  }

}
