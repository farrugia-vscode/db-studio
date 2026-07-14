import type { DriverKind, TableDesign } from './types';

/** Messages from the extension host to the table designer webview. */
export interface DesignerInitMessage {
  type: 'init';
  mode: 'create' | 'modify';
  driver: DriverKind;
  table: string;
  design: TableDesign;
  /** Tables in the namespace, for the foreign-key "references" dropdown. */
  tables: string[];
}

/** Columns of a referenced table (answer to a webview request). */
export interface DesignerRefColumnsMessage {
  type: 'refColumns';
  table: string;
  columns: string[];
}

export interface DesignerSqlMessage {
  type: 'sql';
  sql: string;
}

export interface DesignerErrorMessage {
  type: 'error';
  message: string;
}

export type ExtensionToDesigner =
  | DesignerInitMessage
  | DesignerSqlMessage
  | DesignerErrorMessage
  | DesignerRefColumnsMessage;

/** Messages from the table designer webview back to the extension host. */
export interface DesignerReadyMessage {
  type: 'ready';
}

export interface DesignerPreviewMessage {
  type: 'preview';
  table: string;
  design: TableDesign;
}

export interface DesignerApplyMessage {
  type: 'apply';
  table: string;
  design: TableDesign;
}

/** Ask the host for the columns of a referenced table. */
export interface DesignerRefColumnsRequest {
  type: 'refColumns';
  table: string;
}

export type DesignerToExtension =
  | DesignerReadyMessage
  | DesignerPreviewMessage
  | DesignerApplyMessage
  | DesignerRefColumnsRequest;
