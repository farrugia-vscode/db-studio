import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connectionManager';
import type { ColumnMeta, ConnectionConfig, ForeignKeyMeta, IndexMeta, SchemaObjectKind } from '../domain/types';
import { GroupKind, SchemaNode, TablePartKind } from './schemaNode';
import { getConnectionIcon } from './connectionIcon';
import { formatRowCount } from '../domain/rowCount';

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

  /** Re-query the whole tree, or just `node` and its descendants. */
  refresh(node?: SchemaNode): void {
    this.emitter.fire(node);
  }

  getTreeItem(node: SchemaNode): vscode.TreeItem {
    return node;
  }

  getChildren(node?: SchemaNode): Promise<SchemaNode[]> {
    if (!node) {
      return this.buildRootNodes();
    }
    if (node.kind === 'connectionGroup') {
      return Promise.resolve(this.buildConnectionNodes(node.groupName ?? ''));
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

  /** Grouped connections sit in folders (alphabetical), the ungrouped ones follow in their order. */
  private buildRootNodes(): Promise<SchemaNode[]> {
    const connections = this.visibleConnections();
    const groups = [...new Set(connections.map((connection) => groupOf(connection)).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right),
    );
    const folders = groups.map((group) => {
      const node = new SchemaNode('connectionGroup', group, vscode.TreeItemCollapsibleState.Expanded, '');
      node.groupName = group;
      node.iconPath = new vscode.ThemeIcon('folder');
      node.description = String(connections.filter((connection) => groupOf(connection) === group).length);
      return node;
    });
    return Promise.resolve([...folders, ...this.buildConnectionNodes('')]);
  }

  private visibleConnections(): ConnectionConfig[] {
    // An empty/unset visibility list means "show all".
    const visible = this.context.workspaceState.get<string[]>(VISIBLE_CONNECTIONS_KEY, []);
    return this.manager.getConnections().filter((connection) => visible.length === 0 || visible.includes(connection.name));
  }

  private buildConnectionNodes(group: string): SchemaNode[] {
    return this.visibleConnections()
      .filter((connection) => groupOf(connection) === group)
      .map((connection) => {
        // The colour rides on the icon, so the label stays the bare connection name.
        const node = new SchemaNode('connection', connection.name, Collapsed, connection.name);
        node.description = `${connection.driver} · ${describeSource(connection)}`;
        node.iconPath = getConnectionIcon(connection);
        return node;
      });
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
    const showRowCounts = vscode.workspace.getConfiguration('dbStudio').get<boolean>('showRowCounts', true);
    const [tables, views, routines, triggers, sequences, rowCounts] = await Promise.all([
      driver.listTables(namespace),
      driver.listViews(namespace),
      driver.listRoutines(namespace),
      driver.listTriggers(namespace),
      driver.listSequences(namespace),
      showRowCounts ? driver.estimateRowCounts(namespace).catch(() => new Map<string, number>()) : new Map<string, number>(),
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
      const estimate = rowCounts.get(table);
      if (estimate !== undefined) {
        node.description = `~${formatRowCount(estimate)}`;
        node.tooltip = `${table}  ·  about ${estimate.toLocaleString()} rows (from the engine's statistics)`;
      }
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

  /** The PHPStorm-style folders under a table: Columns, Foreign keys, Indexes. */
  private async buildTablePartNodes(parent: SchemaNode): Promise<SchemaNode[]> {
    const driver = await this.manager.getDriver(parent.connectionName);
    const namespace = parent.namespace!;
    const table = parent.table!;
    const [columns, foreignKeys, indexes] = await Promise.all([
      driver.listColumns(namespace, table),
      driver.listForeignKeys(namespace, table),
      driver.listIndexes(namespace, table),
    ]);
    // Both engines back a unique constraint with an index, so a separate Keys folder
    // would repeat what Indexes already lists. The primary key is counted apart: the
    // drivers leave it out of listIndexes and it is rebuilt from the columns.
    const primaryCount = columns.some((column) => column.isPrimaryKey) ? 1 : 0;

    const nodes: SchemaNode[] = [];
    this.pushTablePart(nodes, parent, 'columns', columns.length);
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
    if (parent.tablePartKind === 'foreignKeys') {
      const foreignKeys = await driver.listForeignKeys(namespace, table);
      return foreignKeys.map((fk) => this.buildFieldNode(parent, fk.name, describeForeignKey(fk), 'references'));
    }
    const [columns, indexes] = await Promise.all([
      driver.listColumns(namespace, table),
      driver.listIndexes(namespace, table),
    ]);
    // Primary first, then the unique ones: the closer an index is to identifying a row,
    // the higher it belongs in the list.
    const unique = indexes.filter((index) => index.isUnique);
    const plain = indexes.filter((index) => !index.isUnique);

    return [
      ...this.primaryKeyNode(parent, columns),
      ...unique.map((index) => this.buildIndexNode(parent, index, 'unique')),
      ...plain.map((index) => this.buildIndexNode(parent, index, 'index')),
    ];
  }

  /**
   * The primary key as an index entry: the drivers leave it out of `listIndexes`, where
   * it would carry an engine-specific name instead of the PRIMARY every engine shows.
   */
  private primaryKeyNode(parent: SchemaNode, columns: ColumnMeta[]): SchemaNode[] {
    const pkColumns = columns.filter((column) => column.isPrimaryKey).map((column) => column.name);
    if (pkColumns.length === 0) {
      return [];
    }
    return [this.buildFieldNode(parent, 'PRIMARY', `(${pkColumns.join(', ')})  primary`, INDEX_ICONS.primary)];
  }

  private buildIndexNode(parent: SchemaNode, index: IndexMeta, kind: IndexKind): SchemaNode {
    return this.buildFieldNode(parent, index.name, `(${index.columns.join(', ')})  ${kind}`, INDEX_ICONS[kind]);
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
  foreignKeys: 'Foreign keys',
  indexes: 'Indexes',
};

/** What an index guarantees, from the strongest to the weakest. */
type IndexKind = 'primary' | 'unique' | 'index';

const INDEX_ICONS: Record<IndexKind, string> = {
  primary: 'key',
  unique: 'lock',
  index: 'list-selection',
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

function groupOf(connection: ConnectionConfig): string {
  return connection.group?.trim() ?? '';
}

/** What a connection points at: the database file for SQLite, the server host otherwise. */
function describeSource(connection: ConnectionConfig): string {
  if (connection.driver !== 'sqlite') {
    return connection.host ?? '';
  }
  const filePath = connection.filePath ?? '';
  return filePath.split('/').pop() ?? filePath;
}
