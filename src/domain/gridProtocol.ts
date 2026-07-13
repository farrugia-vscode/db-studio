import type { ColumnMeta, Row } from './types';
import type { EditDto } from './edits/edit';

/** Messages sent from the extension host to the grid webview. */
export interface GridDataMessage {
  type: 'data';
  table: string;
  columns: ColumnMeta[];
  pkColumns: string[];
  rows: Row[];
  /** The owning connection's color, tinting the grid window. */
  color?: string;
  /** Pagination: total matching rows, current window start and page size. */
  total: number;
  offset: number;
  pageSize: number;
}

export interface GridErrorMessage {
  type: 'error';
  message: string;
}

/** Live re-tint when the owning connection's color changes. */
export interface GridColorMessage {
  type: 'color';
  color?: string;
}

export type ExtensionToWebview = GridDataMessage | GridErrorMessage | GridColorMessage;

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

/** Server-side quick filter across all columns. */
export interface FilterMessage {
  type: 'filter';
  value: string;
}

/** Move to a page / change the page size. */
export interface PageMessage {
  type: 'page';
  offset: number;
  pageSize: number;
}

export type WebviewToExtension = ReadyMessage | ReloadMessage | CommitMessage | FilterMessage | PageMessage;
