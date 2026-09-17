import * as vscode from 'vscode';
import type { DatabaseDriver } from '../domain/driver';
import type { ConnectionConfig } from '../domain/types';
import { DriverFactory } from '../drivers/driverFactory';

const SECRET_PREFIX = 'dbStudio.password.';
const GLOBAL_CLEARED_KEY = 'dbStudio.globalConnectionsCleared';

/**
 * Owns connection configuration, secret passwords and live driver instances.
 * One driver is cached per connection name. Driver creation is delegated to
 * {@link DriverFactory} (DIP) so this class knows nothing about engines.
 *
 * Connections are scoped to the open folder/workspace: config is read from and
 * written to the workspace settings (`.vscode/settings.json`), and secrets are
 * keyed by workspace so identically named connections in different projects
 * never collide. With no folder open, everything falls back to global scope.
 */
export class ConnectionManager {
  private readonly drivers = new Map<string, DatabaseDriver>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly driverFactory: DriverFactory,
  ) {}

  private get isWorkspaceOpen(): boolean {
    return (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
  }

  /** Stable identifier of the open workspace, used to namespace secrets. */
  private get workspaceScope(): string {
    return (
      vscode.workspace.workspaceFile?.fsPath ??
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
      ''
    );
  }

  private secretKey(name: string): string {
    const scope = this.workspaceScope;
    return scope ? `${SECRET_PREFIX}${scope}::${name}` : `${SECRET_PREFIX}${name}`;
  }

  getConnections(): ConnectionConfig[] {
    const inspected = vscode.workspace
      .getConfiguration('dbStudio')
      .inspect<ConnectionConfig[]>('connections');
    return (this.isWorkspaceOpen ? inspected?.workspaceValue : inspected?.globalValue) ?? [];
  }

  getConnection(name: string): ConnectionConfig | undefined {
    return this.getConnections().find((connection) => connection.name === name);
  }

  /**
   * Saves (adds or replaces in place) a connection. Pass `password: undefined` to keep the
   * stored one. The array order is the tree order, so a replaced entry keeps its slot.
   */
  async saveConnection(config: ConnectionConfig, password?: string): Promise<void> {
    const connections = this.getConnections();
    const index = connections.findIndex((connection) => connection.name === config.name);
    if (index >= 0) {
      connections[index] = config;
    } else {
      connections.push(config);
    }
    await this.writeConnections(connections);
    if (password !== undefined) {
      await this.context.secrets.store(this.secretKey(config.name), password);
    }
    // Drop any cached driver so the new host/credentials take effect on next use.
    await this.closeDriver(config.name);
  }

  /**
   * Renames a connection: writes the new config (carrying over the stored
   * password when `password` is undefined) and drops the old entry + secret.
   */
  async renameConnection(oldName: string, config: ConnectionConfig, password?: string): Promise<void> {
    const resolved = password ?? (await this.context.secrets.get(this.secretKey(oldName))) ?? '';
    await this.saveConnection(config, resolved);
    if (oldName !== config.name) {
      await this.removeConnection(oldName);
    }
  }

  /** Copies a connection (config + stored password) under a fresh unique name; returns it. */
  async duplicateConnection(name: string): Promise<string | undefined> {
    const source = this.getConnection(name);
    if (!source) {
      return undefined;
    }
    const newName = this.uniqueName(`${name} copy`);
    const password = (await this.context.secrets.get(this.secretKey(name))) ?? '';
    await this.saveConnection({ ...source, name: newName }, password);
    return newName;
  }

  private uniqueName(base: string): string {
    const existing = new Set(this.getConnections().map((connection) => connection.name));
    if (!existing.has(base)) {
      return base;
    }
    let suffix = 2;
    while (existing.has(`${base} ${suffix}`)) {
      suffix += 1;
    }
    return `${base} ${suffix}`;
  }

  /** Every distinct group name in use, for the form's suggestions. */
  getGroups(): string[] {
    const groups = new Set(this.getConnections().map((connection) => connection.group?.trim() ?? '').filter(Boolean));
    return [...groups].sort((left, right) => left.localeCompare(right));
  }

  /**
   * Swaps a connection with its previous (`-1`) or next (`+1`) neighbour of the same group, since
   * the tree lists each group in array order. A no-op at the edge.
   */
  async moveConnection(name: string, direction: -1 | 1): Promise<void> {
    const connections = this.getConnections();
    const index = connections.findIndex((connection) => connection.name === name);
    if (index < 0) {
      return;
    }
    const group = connections[index].group?.trim() ?? '';
    let neighbour = index + direction;
    while (neighbour >= 0 && neighbour < connections.length && (connections[neighbour].group?.trim() ?? '') !== group) {
      neighbour += direction;
    }
    if (neighbour < 0 || neighbour >= connections.length) {
      return;
    }
    [connections[index], connections[neighbour]] = [connections[neighbour], connections[index]];
    await this.writeConnections(connections);
  }

  async removeConnection(name: string): Promise<void> {
    const connections = this.getConnections().filter((connection) => connection.name !== name);
    await this.writeConnections(connections);
    await this.context.secrets.delete(this.secretKey(name));
    await this.closeDriver(name);
  }

  /**
   * Opens a throwaway connection to validate the settings, then closes it.
   * `password: undefined` falls back to the stored secret (edit mode). Rejects
   * with the driver error, or a timeout, when the connection cannot be opened.
   */
  async testConnection(config: ConnectionConfig, password?: string): Promise<void> {
    const resolved = password ?? (await this.context.secrets.get(this.secretKey(config.name))) ?? '';
    const driver = this.driverFactory.make(config, resolved);
    try {
      await withTimeout(driver.connect(), 8000, 'Connection timed out after 8s');
    } finally {
      await driver.close().catch(() => undefined);
    }
  }

  async getDriver(name: string): Promise<DatabaseDriver> {
    const cached = this.drivers.get(name);
    if (cached) {
      return cached;
    }
    const config = this.getConnection(name);
    if (!config) {
      throw new Error(`Unknown connection: ${name}`);
    }
    const password = (await this.context.secrets.get(this.secretKey(name))) ?? '';
    const driver = this.driverFactory.make(config, password);
    this.drivers.set(name, driver);
    return driver;
  }

  async closeAll(): Promise<void> {
    for (const name of [...this.drivers.keys()]) {
      await this.closeDriver(name);
    }
  }

  private async closeDriver(name: string): Promise<void> {
    const driver = this.drivers.get(name);
    if (!driver) {
      return;
    }
    await driver.close();
    this.drivers.delete(name);
  }

  private writeConnections(connections: ConnectionConfig[]): Thenable<void> {
    const target = this.isWorkspaceOpen
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    return vscode.workspace.getConfiguration('dbStudio').update('connections', connections, target);
  }

  /**
   * One-shot cleanup: connections are now scoped per workspace, so any leftover
   * global connections (and their unscoped secrets) are removed. Runs at most
   * once (guarded by a flag) so it never wipes the no-folder global fallback.
   */
  async clearGlobalConnections(): Promise<void> {
    if (this.context.globalState.get<boolean>(GLOBAL_CLEARED_KEY, false)) {
      return;
    }
    const config = vscode.workspace.getConfiguration('dbStudio');
    const global = config.inspect<ConnectionConfig[]>('connections')?.globalValue ?? [];
    for (const connection of global) {
      await this.context.secrets.delete(SECRET_PREFIX + connection.name);
    }
    if (global.length > 0) {
      await config.update('connections', undefined, vscode.ConfigurationTarget.Global);
    }
    await this.context.globalState.update(GLOBAL_CLEARED_KEY, true);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}
