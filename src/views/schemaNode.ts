import * as vscode from 'vscode';
import type { SchemaObjectKind } from '../domain/types';

export type NodeKind = 'connection' | 'namespace' | 'group' | 'table' | 'object';

/** Which object family a `group` node lists. `tables` are shown directly, not grouped. */
export type GroupKind = 'views' | 'procedures' | 'functions' | 'triggers' | 'sequences';

/** A single node of the schema tree; carries the coordinates its children need. */
export class SchemaNode extends vscode.TreeItem {
  constructor(
    public readonly kind: NodeKind,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly connectionName: string,
    public readonly namespace?: string,
    public readonly table?: string,
    /** For `group` nodes: the object family listed underneath. */
    public readonly groupKind?: GroupKind,
    /** For `object` nodes: the concrete object kind (drives the DDL query). */
    public readonly objectKind?: SchemaObjectKind,
  ) {
    super(label, collapsibleState);
    this.contextValue = kind;
  }
}
