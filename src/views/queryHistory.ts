import * as vscode from 'vscode';

const HISTORY_PREFIX = 'dbStudio.history.';
const MAX_HISTORY = 100;

/**
 * Per-connection log of executed SQL, shared by the SQL console and the data grid so
 * every statement — a console run or a grid read/write — lands in one history.
 */
export class QueryHistory {
  constructor(private readonly context: vscode.ExtensionContext) {}

  list(connectionName: string): string[] {
    return this.context.workspaceState.get<string[]>(HISTORY_PREFIX + connectionName, []);
  }

  /** Prepend a statement (newest first, deduped); returns the capped list. */
  async push(connectionName: string, sql: string): Promise<string[]> {
    const trimmed = sql.trim();
    if (trimmed === '') {
      return this.list(connectionName);
    }
    const history = this.list(connectionName).filter((entry) => entry !== trimmed);
    history.unshift(trimmed);
    const capped = history.slice(0, MAX_HISTORY);
    await this.context.workspaceState.update(HISTORY_PREFIX + connectionName, capped);
    return capped;
  }
}
