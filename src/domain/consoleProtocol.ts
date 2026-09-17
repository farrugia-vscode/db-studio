import type { DriverKind } from './types';

/** Messages from the extension host to the SQL console webview. */
export interface ConsoleInitMessage {
  type: 'init';
  sql: string;
  /** Schemas the connection exposes, for the console's schema picker. */
  namespaces: string[];
  /** The schema queries run against (preselected when launched from a schema node). */
  namespace: string;
  /** The connection's engine, so the editor formats SQL in the right dialect. */
  driver: DriverKind;
}

/** One result column, with whether its cells can be safely edited (write back to the source table). */
export interface ConsoleResultColumn {
  name: string;
  sourceTable: string | null;
  sourceColumn: string | null;
  editable: boolean;
}

/** A source table whose rows the result can update, and where its primary key lives in the result. */
export interface ConsoleEditableTable {
  table: string;
  /** Source primary-key column names. */
  pkColumns: string[];
  /** Result column indices holding those PK values, in the same order as pkColumns. */
  pkIndexes: number[];
}

/** One statement's result set (a script can produce several). */
export interface ConsoleResult {
  /** Short label for the result tab (a snippet of the statement). */
  label: string;
  columns: string[];
  rows: Array<Array<string | null>>;
  affectedRows?: number;
  error?: string;
  /** Wall-clock time of the statement on the host, in milliseconds. */
  durationMs: number;
  /** Per-column provenance + editability (MySQL only; absent → whole result is read-only). */
  columnsMeta?: ConsoleResultColumn[];
  editableTables?: ConsoleEditableTable[];
}

/** Results of running the script — one entry per `;`-separated statement. */
export interface ConsoleResultsMessage {
  type: 'results';
  results: ConsoleResult[];
}

/** One cell update from an editable result: SET column = value WHERE the row's primary key matches. */
export interface ConsoleCellEdit {
  table: string;
  column: string;
  value: string | null;
  pk: Array<{ column: string; value: string | null }>;
}

/** One table's shape, used by the editor for schema-aware autocomplete. */
export interface ConsoleTableSchema {
  name: string;
  columns: string[];
}

/** Snapshot of the connection's default database, sent once for autocomplete. */
export interface ConsoleSchemaMessage {
  type: 'schema';
  tables: ConsoleTableSchema[];
}

/** One executed statement, with when it ran and how many rows it touched. */
export interface HistoryEntry {
  sql: string;
  /** Epoch ms of execution (0 for legacy entries logged before timing existed). */
  at: number;
  /** Rows returned by a read (SELECT). */
  rowCount?: number;
  /** Rows affected by a write (INSERT/UPDATE/DELETE). */
  affectedRows?: number;
  /** Wall-clock time of the statement, in milliseconds. */
  durationMs?: number;
}

/** A named, reusable statement kept per workspace (shared by every connection). */
export interface Snippet {
  id: string;
  name: string;
  sql: string;
  createdAt: number;
}

/** The whole snippet list, sorted by name; sent on open and after every change. */
export interface ConsoleSnippetsMessage {
  type: 'snippets';
  items: Snippet[];
}

/** Recently run queries for this connection, newest first. */
export interface ConsoleHistoryMessage {
  type: 'history';
  items: HistoryEntry[];
}

/** Preselect a schema in an already-open console (relaunched from a schema node). */
export interface ConsoleSelectSchemaMessage {
  type: 'selectSchema';
  namespace: string;
}

/** Result of applying edited result cells. */
export interface ConsoleUpdateResultMessage {
  type: 'updateResult';
  count: number;
  error?: string;
}

export type ExtensionToConsole =
  | ConsoleInitMessage
  | ConsoleResultsMessage
  | ConsoleSchemaMessage
  | ConsoleHistoryMessage
  | ConsoleSnippetsMessage
  | ConsoleSelectSchemaMessage
  | ConsoleUpdateResultMessage;

/** Messages from the SQL console webview back to the extension host. */
export interface ConsoleReadyMessage {
  type: 'ready';
}

export interface ConsoleSaveMessage {
  type: 'save';
  sql: string;
}

export interface ConsoleRunMessage {
  type: 'run';
  sql: string;
  /** Schema to run against (from the picker). */
  namespace: string;
  /** Run the engine's EXPLAIN over each statement instead of the statement itself. */
  explain?: boolean;
}

/** Interrupt the statement currently running (the rest of the script is skipped). */
export interface ConsoleCancelMessage {
  type: 'cancel';
}

/** The user picked another schema in the console; refresh autocomplete for it. */
export interface ConsoleSchemaChangeMessage {
  type: 'schemaChange';
  namespace: string;
}

/** Save the (already formatted) query history to a file. */
export interface ConsoleExportHistoryMessage {
  type: 'exportHistory';
  format: 'csv' | 'markdown';
  content: string;
  count: number;
}

/** Wipe this connection's query history (host confirms before clearing). */
export interface ConsoleClearHistoryMessage {
  type: 'clearHistory';
}

/** Save `sql` as a snippet; the host asks for its name. */
export interface ConsoleSaveSnippetMessage {
  type: 'saveSnippet';
  sql: string;
}

/** Rename a snippet; the host asks for the new name. */
export interface ConsoleRenameSnippetMessage {
  type: 'renameSnippet';
  id: string;
}

export interface ConsoleDeleteSnippetMessage {
  type: 'deleteSnippet';
  id: string;
}

/** Write edited result cells back to their source tables. */
export interface ConsoleUpdateCellsMessage {
  type: 'updateCells';
  /** Schema the edited tables live in (the console's current schema). */
  namespace: string;
  edits: ConsoleCellEdit[];
}

export type ConsoleToExtension =
  | ConsoleReadyMessage
  | ConsoleSaveMessage
  | ConsoleRunMessage
  | ConsoleCancelMessage
  | ConsoleSchemaChangeMessage
  | ConsoleExportHistoryMessage
  | ConsoleClearHistoryMessage
  | ConsoleSaveSnippetMessage
  | ConsoleRenameSnippetMessage
  | ConsoleDeleteSnippetMessage
  | ConsoleUpdateCellsMessage;
