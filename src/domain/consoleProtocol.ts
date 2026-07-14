/** Messages from the extension host to the SQL console webview. */
export interface ConsoleInitMessage {
  type: 'init';
  sql: string;
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

export type ExtensionToConsole = ConsoleInitMessage | ConsoleResultMessage | ConsoleSchemaMessage;

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
}

export type ConsoleToExtension = ConsoleReadyMessage | ConsoleSaveMessage | ConsoleRunMessage;
