import * as vscode from 'vscode';
import type { Snippet } from '../domain/consoleProtocol';

const STORAGE_KEY = 'dbStudio.snippets';

/**
 * Named SQL snippets, shared by every console of the workspace (the same project usually has
 * several connections - local, staging - that run the same queries).
 */
export class SnippetStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  list(): Snippet[] {
    return this.context.workspaceState.get<Snippet[]>(STORAGE_KEY, []);
  }

  async add(name: string, sql: string): Promise<Snippet[]> {
    const snippets = [...this.list(), { id: buildId(), name, sql, createdAt: Date.now() }];
    return this.save(snippets);
  }

  async rename(id: string, name: string): Promise<Snippet[]> {
    return this.save(this.list().map((snippet) => (snippet.id === id ? { ...snippet, name } : snippet)));
  }

  async remove(id: string): Promise<Snippet[]> {
    return this.save(this.list().filter((snippet) => snippet.id !== id));
  }

  private async save(snippets: Snippet[]): Promise<Snippet[]> {
    const sorted = [...snippets].sort((left, right) => left.name.localeCompare(right.name));
    await this.context.workspaceState.update(STORAGE_KEY, sorted);
    return sorted;
  }
}

function buildId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
