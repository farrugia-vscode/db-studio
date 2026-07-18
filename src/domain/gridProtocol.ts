import type { ColumnMeta, ForeignKeyMeta, IncomingForeignKey, Row } from './types';
import type { EditDto } from './edits/edit';

/** Messages sent from the extension host to the grid webview. */
export interface GridDataMessage {
  type: 'data';
  namespace: string;
  table: string;
  columns: ColumnMeta[];
  pkColumns: string[];
  /** Foreign keys defined on this table (for the value dropdown and forward navigation). */
  foreignKeys: ForeignKeyMeta[];
  /** Foreign keys in other tables that point here (for reverse navigation). */
  incomingForeignKeys: IncomingForeignKey[];
  rows: Row[];
  /** Pagination: total matching rows, current window start and page size. */
  total: number;
  offset: number;
  pageSize: number;
  /** The active WHERE condition, so the filter box reflects a navigation. */
  filter: string;
  /** The active ORDER BY clause (without the keyword); empty = unsorted. */
  orderBy: string;
  /** Locale for displaying date columns (empty = raw ISO). */
  dateLocale: string;
}

export interface GridErrorMessage {
  type: 'error';
  message: string;
}

/** Distinct values of a referenced column, returned for an FK dropdown. */
export interface FkValuesResultMessage {
  type: 'fkValuesResult';
  requestId: number;
  values: string[];
}

/** The real SQL statements the pending edits will run, for the bottom review drawer. */
export interface EditsPreviewMessage {
  type: 'editsPreview';
  statements: string[];
}

export type ExtensionToWebview = GridDataMessage | GridErrorMessage | FkValuesResultMessage | EditsPreviewMessage;

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

/** Ask the host to render the pending edits as real SQL for the review drawer. */
export interface PreviewEditsMessage {
  type: 'previewEdits';
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

/** Sort by a column server-side from a header click (empty column clears the sort). */
export interface SortMessage {
  type: 'sort';
  column: string;
  direction: 'ASC' | 'DESC';
}

/** Set a raw ORDER BY clause (without the keyword) typed in the order-by box. */
export interface OrderMessage {
  type: 'order';
  orderBy: string;
}

export type CopyFormat = 'markdown' | 'insert' | 'csv' | 'html' | 'xml' | 'json';

/** Copy a selected cell range to the clipboard in the chosen format. */
export interface CopyMessage {
  type: 'copy';
  format: CopyFormat;
  columns: string[];
  rows: Array<Array<string | null>>;
}

/** Export the selection (or all rows) to a file in the chosen format. */
export interface ExportMessage {
  type: 'export';
  format: CopyFormat;
  columns: string[];
  rows: Array<Array<string | null>>;
}

/** Load the first values of a referenced column to populate an FK cell dropdown. */
export interface FkValuesMessage {
  type: 'fkValues';
  requestId: number;
  refTable: string;
  refColumn: string;
}

/** Open another table filtered to `columns = values` (foreign-key navigation). */
export interface OpenRelatedMessage {
  type: 'openRelated';
  namespace: string;
  table: string;
  columns: string[];
  values: Array<string | null>;
}

export type WebviewToExtension =
  | ReadyMessage
  | ReloadMessage
  | CommitMessage
  | FilterMessage
  | PageMessage
  | SortMessage
  | OrderMessage
  | CopyMessage
  | ExportMessage
  | FkValuesMessage
  | OpenRelatedMessage
  | PreviewEditsMessage;
