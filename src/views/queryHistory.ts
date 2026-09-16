import * as vscode from 'vscode';
import type { HistoryEntry } from '../domain/consoleProtocol';

const HISTORY_PREFIX = 'dbStudio.history.';

/** Extra metadata recorded alongside a statement when it runs. */
export interface HistoryMeta {
  rowCount?: number;
  affectedRows?: number;
}

/**
 * Per-connection log of executed SQL, shared by the SQL console and the data grid so
 * every statement — a console run or a grid read/write — lands in one history, with the
 * time it ran and how many rows it returned/affected.
 */
export class QueryHistory {
  constructor(private readonly context: vscode.ExtensionContext) {}

  list(connectionName: string): HistoryEntry[] {
    const stored = this.context.workspaceState.get<Array<HistoryEntry | string>>(HISTORY_PREFIX + connectionName, []);
    // Legacy entries were bare SQL strings; normalize them to timestamp-less entries.
    return stored.map((entry) => (typeof entry === 'string' ? { sql: entry, at: 0 } : entry));
  }

  /** Prepend a statement (newest first, deduped by SQL); returns the full list. */
  async push(connectionName: string, sql: string, meta: HistoryMeta = {}): Promise<HistoryEntry[]> {
    const trimmed = sql.trim();
    if (trimmed === '') {
      return this.list(connectionName);
    }
    const entry: HistoryEntry = { sql: trimmed, at: Date.now(), ...meta };
    const history = this.list(connectionName).filter((existing) => existing.sql !== trimmed);
    history.unshift(entry);
    await this.context.workspaceState.update(HISTORY_PREFIX + connectionName, history);
    return history;
  }

  /** Wipe this connection's history. */
  async clear(connectionName: string): Promise<void> {
    await this.context.workspaceState.update(HISTORY_PREFIX + connectionName, []);
  }
}
