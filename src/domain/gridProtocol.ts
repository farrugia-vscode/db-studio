import type { ColumnMeta, Row } from './types';
import type { EditDto } from './edits/edit';

/** Messages sent from the extension host to the grid webview. */
export interface GridDataMessage {
  type: 'data';
  table: string;
  columns: ColumnMeta[];
  pkColumns: string[];
  rows: Row[];
}

export interface GridErrorMessage {
  type: 'error';
  message: string;
}

export type ExtensionToWebview = GridDataMessage | GridErrorMessage;

/** Messages sent from the grid webview back to the extension host. */
export interface ReadyMessage {
  type: 'ready';
}

export interface ReloadMessage {
  type: 'reload';
}

export interface CommitMessage {
  type: 'commit';
  edits: EditDto[];
}

export type WebviewToExtension = ReadyMessage | ReloadMessage | CommitMessage;
