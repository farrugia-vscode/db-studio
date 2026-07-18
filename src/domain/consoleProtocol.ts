/** Messages from the extension host to the SQL console webview. */
export interface ConsoleInitMessage {
  type: 'init';
  sql: string;
  /** Schemas the connection exposes, for the console's schema picker. */
  namespaces: string[];
  /** The schema queries run against (preselected when launched from a schema node). */
  namespace: string;
}

export interface ConsoleResultMessage {
  type: 'result';
  columns: string[];
  rows: Array<Array<string | null>>;
  affectedRows?: number;
  error?: string;
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

/** Recently run queries for this connection, newest first. */
export interface ConsoleHistoryMessage {
  type: 'history';
  items: string[];
}

/** Preselect a schema in an already-open console (relaunched from a schema node). */
export interface ConsoleSelectSchemaMessage {
  type: 'selectSchema';
  namespace: string;
}

export type ExtensionToConsole =
  | ConsoleInitMessage
  | ConsoleResultMessage
  | ConsoleSchemaMessage
  | ConsoleHistoryMessage
  | ConsoleSelectSchemaMessage;

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
}

/** The user picked another schema in the console; refresh autocomplete for it. */
export interface ConsoleSchemaChangeMessage {
  type: 'schemaChange';
  namespace: string;
}

export type ConsoleToExtension =
  | ConsoleReadyMessage
  | ConsoleSaveMessage
  | ConsoleRunMessage
  | ConsoleSchemaChangeMessage;
