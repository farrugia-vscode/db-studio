import type { ColumnDraft } from './types';

/** Messages from the extension host to the table designer webview. */
export interface DesignerInitMessage {
  type: 'init';
  mode: 'create' | 'modify';
  table: string;
  columns: ColumnDraft[];
}

export interface DesignerSqlMessage {
  type: 'sql';
  sql: string;
}

export interface DesignerErrorMessage {
  type: 'error';
  message: string;
}

export type ExtensionToDesigner = DesignerInitMessage | DesignerSqlMessage | DesignerErrorMessage;

/** Messages from the table designer webview back to the extension host. */
export interface DesignerReadyMessage {
  type: 'ready';
}

export interface DesignerPreviewMessage {
  type: 'preview';
  table: string;
  columns: ColumnDraft[];
}

export interface DesignerApplyMessage {
  type: 'apply';
  table: string;
  columns: ColumnDraft[];
}

export type DesignerToExtension = DesignerReadyMessage | DesignerPreviewMessage | DesignerApplyMessage;
