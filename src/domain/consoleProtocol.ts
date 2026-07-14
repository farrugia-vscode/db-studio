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

export type ExtensionToConsole = ConsoleInitMessage | ConsoleResultMessage;

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
