import * as vscode from 'vscode';

export type NodeKind = 'connection' | 'namespace' | 'table' | 'column';

/** A single node of the schema tree; carries the coordinates its children need. */
export class SchemaNode extends vscode.TreeItem {
  constructor(
    public readonly kind: NodeKind,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly connectionName: string,
    public readonly namespace?: string,
    public readonly table?: string,
  ) {
    super(label, collapsibleState);
    this.contextValue = kind;
  }
}
