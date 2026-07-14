import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connectionManager';
import type { SchemaObjectKind } from '../domain/types';
import { ConnectionIconProvider } from './connectionIconProvider';
import { GroupKind, SchemaNode } from './schemaNode';

const Collapsed = vscode.TreeItemCollapsibleState.Collapsed;
const None = vscode.TreeItemCollapsibleState.None;

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
      return this.buildNamespaceChildren(node);
    }
    if (node.kind === 'group') {
      return this.buildObjectNodes(node);
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

  /** Tables listed directly, then a folder per non-empty object family (PHPStorm-style). */
  private async buildNamespaceChildren(parent: SchemaNode): Promise<SchemaNode[]> {
    const driver = await this.manager.getDriver(parent.connectionName);
    const namespace = parent.namespace!;
    const [tables, views, routines, triggers, sequences] = await Promise.all([
      driver.listTables(namespace),
      driver.listViews(namespace),
      driver.listRoutines(namespace),
      driver.listTriggers(namespace),
      driver.listSequences(namespace),
    ]);
    const procedures = routines.filter((routine) => routine.kind === 'procedure').length;
    const functions = routines.filter((routine) => routine.kind === 'function').length;

    const nodes = tables.map((table) => {
      const node = new SchemaNode('table', table, Collapsed, parent.connectionName, namespace, table);
      node.iconPath = new vscode.ThemeIcon('table');
      // Open the data grid when the table row is activated (honors the user's single/double-click mode).
      node.command = { command: 'dbStudio.openTableData', title: 'Open Table Data', arguments: [node] };
      return node;
    });

    this.pushGroup(nodes, parent, 'views', views.length);
    this.pushGroup(nodes, parent, 'procedures', procedures);
    this.pushGroup(nodes, parent, 'functions', functions);
    this.pushGroup(nodes, parent, 'triggers', triggers.length);
    this.pushGroup(nodes, parent, 'sequences', sequences.length);
    return nodes;
  }

  private pushGroup(nodes: SchemaNode[], parent: SchemaNode, groupKind: GroupKind, count: number): void {
    if (count === 0) {
      return;
    }
    const node = new SchemaNode('group', GROUP_LABELS[groupKind], Collapsed, parent.connectionName, parent.namespace, undefined, groupKind);
    node.description = String(count);
    node.iconPath = new vscode.ThemeIcon('folder');
    nodes.push(node);
  }

  private async buildObjectNodes(parent: SchemaNode): Promise<SchemaNode[]> {
    const driver = await this.manager.getDriver(parent.connectionName);
    const namespace = parent.namespace!;
    const groupKind = parent.groupKind!;
    const names = await this.listGroupObjects(driver, namespace, groupKind);
    const objectKind = GROUP_OBJECT_KIND[groupKind];
    return names.map((name) => {
      const node = new SchemaNode('object', name, None, parent.connectionName, namespace, name, undefined, objectKind);
      node.iconPath = new vscode.ThemeIcon(OBJECT_ICONS[objectKind]);
      // Views open their data; other objects open their read-only DDL.
      const command = objectKind === 'view' ? 'dbStudio.openTableData' : 'dbStudio.showObjectDdl';
      node.command = { command, title: 'Open', arguments: [node] };
      return node;
    });
  }

  private async listGroupObjects(
    driver: Awaited<ReturnType<ConnectionManager['getDriver']>>,
    namespace: string,
    groupKind: GroupKind,
  ): Promise<string[]> {
    if (groupKind === 'views') {
      return driver.listViews(namespace);
    }
    if (groupKind === 'triggers') {
      return driver.listTriggers(namespace);
    }
    if (groupKind === 'sequences') {
      return driver.listSequences(namespace);
    }
    const wanted = groupKind === 'procedures' ? 'procedure' : 'function';
    const routines = await driver.listRoutines(namespace);
    return routines.filter((routine) => routine.kind === wanted).map((routine) => routine.name);
  }
}

const GROUP_LABELS: Record<GroupKind, string> = {
  views: 'Views',
  procedures: 'Procedures',
  functions: 'Functions',
  triggers: 'Triggers',
  sequences: 'Sequences',
};

const GROUP_OBJECT_KIND: Record<GroupKind, SchemaObjectKind> = {
  views: 'view',
  procedures: 'procedure',
  functions: 'function',
  triggers: 'trigger',
  sequences: 'sequence',
};

const OBJECT_ICONS: Record<SchemaObjectKind, string> = {
  view: 'eye',
  procedure: 'symbol-method',
  function: 'symbol-function',
  trigger: 'zap',
  sequence: 'list-ordered',
};
