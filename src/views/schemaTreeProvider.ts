import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connectionManager';
import type { ColumnMeta, ForeignKeyMeta, SchemaObjectKind } from '../domain/types';
import { GroupKind, SchemaNode, TablePartKind } from './schemaNode';

const Collapsed = vscode.TreeItemCollapsibleState.Collapsed;
const None = vscode.TreeItemCollapsibleState.None;
export const VISIBLE_PREFIX = 'dbStudio.visibleNamespaces.';
/** Names of connections to show in the tree (empty/unset = show all). */
export const VISIBLE_CONNECTIONS_KEY = 'dbStudio.visibleConnections';

/**
 * Lazily builds the schema tree: connection → namespace → table → column.
 * Depends only on {@link ConnectionManager} to resolve a driver per connection.
 */
export class SchemaTreeProvider implements vscode.TreeDataProvider<SchemaNode> {
  private readonly emitter = new vscode.EventEmitter<SchemaNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly manager: ConnectionManager,
    private readonly context: vscode.ExtensionContext,
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
    if (node.kind === 'table') {
      return this.buildTablePartNodes(node);
    }
    if (node.kind === 'tablePart') {
      return this.buildFieldNodes(node);
    }
    return Promise.resolve([]);
  }

  private buildConnectionNodes(): Promise<SchemaNode[]> {
    // An empty/unset visibility list means "show all".
    const visible = this.context.workspaceState.get<string[]>(VISIBLE_CONNECTIONS_KEY, []);
    const connections = this.manager
      .getConnections()
      .filter((connection) => visible.length === 0 || visible.includes(connection.name));
    return Promise.resolve(
      connections.map((connection) => {
        const label = connection.icon ? `${connection.icon} ${connection.name}` : connection.name;
        const node = new SchemaNode('connection', label, Collapsed, connection.name);
        node.description = `${connection.driver} · ${connection.host}`;
        node.iconPath = new vscode.ThemeIcon('database');
        return node;
      }),
    );
  }

  private async buildNamespaceNodes(parent: SchemaNode): Promise<SchemaNode[]> {
    const driver = await this.manager.getDriver(parent.connectionName);
    const all = await driver.listNamespaces();
    // An empty/unset visibility list means "show all".
    const visible = this.context.workspaceState.get<string[]>(VISIBLE_PREFIX + parent.connectionName, []);
    const namespaces = visible.length > 0 ? all.filter((namespace) => visible.includes(namespace)) : all;
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

    // Expandable tables reveal their structure, but VS Code then toggles them on double-click too.
    // Users who only want a double-click to open the data can turn the structure off.
    const showStructure = vscode.workspace.getConfiguration('dbStudio').get<boolean>('showTableStructure', true);
    const tableState = showStructure ? Collapsed : None;
    const nodes = tables.map((table) => {
      const node = new SchemaNode('table', table, tableState, parent.connectionName, namespace, table);
      node.iconPath = new vscode.ThemeIcon('table');
      // No row command on purpose: a click/double-click never opens the grid (and never
      // fights the expand toggle). Open the data via the inline "Open Table Data" action.
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

  /** The PHPStorm-style folders under a table: Columns, Keys, Foreign keys, Indexes. */
  private async buildTablePartNodes(parent: SchemaNode): Promise<SchemaNode[]> {
    const driver = await this.manager.getDriver(parent.connectionName);
    const namespace = parent.namespace!;
    const table = parent.table!;
    const [columns, foreignKeys, indexes] = await Promise.all([
      driver.listColumns(namespace, table),
      driver.listForeignKeys(namespace, table),
      driver.listIndexes(namespace, table),
    ]);
    // Keys = the primary key plus every unique index; indexes list the primary key too.
    const hasPrimaryKey = columns.some((column) => column.isPrimaryKey);
    const uniqueIndexes = indexes.filter((index) => index.isUnique).length;
    const primaryCount = hasPrimaryKey ? 1 : 0;

    const nodes: SchemaNode[] = [];
    this.pushTablePart(nodes, parent, 'columns', columns.length);
    this.pushTablePart(nodes, parent, 'keys', primaryCount + uniqueIndexes);
    this.pushTablePart(nodes, parent, 'foreignKeys', foreignKeys.length);
    this.pushTablePart(nodes, parent, 'indexes', primaryCount + indexes.length);
    return nodes;
  }

  private pushTablePart(nodes: SchemaNode[], parent: SchemaNode, tablePartKind: TablePartKind, count: number): void {
    // Columns always show; the other folders only when the table has that kind of metadata.
    if (count === 0 && tablePartKind !== 'columns') {
      return;
    }
    const node = new SchemaNode(
      'tablePart',
      TABLE_PART_LABELS[tablePartKind],
      Collapsed,
      parent.connectionName,
      parent.namespace,
      parent.table,
      undefined,
      undefined,
      tablePartKind,
    );
    node.description = String(count);
    node.iconPath = new vscode.ThemeIcon('folder');
    nodes.push(node);
  }

  private async buildFieldNodes(parent: SchemaNode): Promise<SchemaNode[]> {
    const driver = await this.manager.getDriver(parent.connectionName);
    const namespace = parent.namespace!;
    const table = parent.table!;
    if (parent.tablePartKind === 'columns') {
      const [columns, foreignKeys] = await Promise.all([
        driver.listColumns(namespace, table),
        driver.listForeignKeys(namespace, table),
      ]);
      const fkColumns = new Set(foreignKeys.flatMap((fk) => fk.columns));
      return columns.map((column) => this.buildFieldNode(parent, column.name, describeColumn(column), columnIcon(column, fkColumns)));
    }
    if (parent.tablePartKind === 'keys') {
      const [columns, indexes] = await Promise.all([
        driver.listColumns(namespace, table),
        driver.listIndexes(namespace, table),
      ]);
      const nodes = this.primaryKeyNode(parent, columns, false);
      for (const index of indexes.filter((index) => index.isUnique)) {
        nodes.push(this.buildFieldNode(parent, index.name, `(${index.columns.join(', ')})`, 'key'));
      }
      return nodes;
    }
    if (parent.tablePartKind === 'foreignKeys') {
      const foreignKeys = await driver.listForeignKeys(namespace, table);
      return foreignKeys.map((fk) => this.buildFieldNode(parent, fk.name, describeForeignKey(fk), 'references'));
    }
    const [columns, indexes] = await Promise.all([
      driver.listColumns(namespace, table),
      driver.listIndexes(namespace, table),
    ]);
    const nodes = this.primaryKeyNode(parent, columns, true);
    for (const index of indexes) {
      const suffix = index.isUnique ? ' UNIQUE' : '';
      nodes.push(this.buildFieldNode(parent, index.name, `(${index.columns.join(', ')})${suffix}`, 'list-selection'));
    }
    return nodes;
  }

  /** The synthetic PRIMARY entry shared by the Keys and Indexes folders (indexes mark it UNIQUE). */
  private primaryKeyNode(parent: SchemaNode, columns: ColumnMeta[], asIndex: boolean): SchemaNode[] {
    const pkColumns = columns.filter((column) => column.isPrimaryKey).map((column) => column.name);
    if (pkColumns.length === 0) {
      return [];
    }
    const suffix = asIndex ? ' UNIQUE' : '';
    return [this.buildFieldNode(parent, 'PRIMARY', `(${pkColumns.join(', ')})${suffix}`, 'key')];
  }

  private buildFieldNode(parent: SchemaNode, label: string, description: string, icon: string): SchemaNode {
    const node = new SchemaNode('field', label, None, parent.connectionName, parent.namespace, parent.table);
    node.description = description;
    node.tooltip = `${label}  ${description}`;
    node.iconPath = new vscode.ThemeIcon(icon);
    return node;
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

const TABLE_PART_LABELS: Record<TablePartKind, string> = {
  columns: 'Columns',
  keys: 'Keys',
  foreignKeys: 'Foreign keys',
  indexes: 'Indexes',
};

function describeColumn(column: ColumnMeta): string {
  return column.isAutoIncrement ? `${column.type} (auto increment)` : column.type;
}

/** Gold key on the primary key, a link glyph on foreign-key columns, a plain field otherwise. */
function columnIcon(column: ColumnMeta, fkColumns: Set<string>): string {
  if (column.isPrimaryKey) {
    return 'key';
  }
  if (fkColumns.has(column.name)) {
    return 'references';
  }
  return 'symbol-field';
}

function describeForeignKey(fk: ForeignKeyMeta): string {
  return `(${fk.columns.join(', ')}) → ${fk.refTable} (${fk.refColumns.join(', ')})`;
}

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
