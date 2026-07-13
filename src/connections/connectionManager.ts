import * as vscode from 'vscode';
import type { DatabaseDriver } from '../domain/driver';
import type { ConnectionConfig } from '../domain/types';
import { DriverFactory } from '../drivers/driverFactory';

const SECRET_PREFIX = 'dbStudio.password.';

/**
 * Owns connection configuration, secret passwords and live driver instances.
 * One driver is cached per connection name. Driver creation is delegated to
 * {@link DriverFactory} (DIP) so this class knows nothing about engines.
 */
export class ConnectionManager {
  private readonly drivers = new Map<string, DatabaseDriver>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly driverFactory: DriverFactory,
  ) {}

  getConnections(): ConnectionConfig[] {
    return vscode.workspace.getConfiguration('dbStudio').get<ConnectionConfig[]>('connections', []);
  }

  getConnection(name: string): ConnectionConfig | undefined {
    return this.getConnections().find((connection) => connection.name === name);
  }

  /** Saves (adds or replaces) a connection. Pass `password: undefined` to keep the stored one. */
  async saveConnection(config: ConnectionConfig, password?: string): Promise<void> {
    const connections = this.getConnections().filter((connection) => connection.name !== config.name);
    connections.push(config);
    await this.writeConnections(connections);
    if (password !== undefined) {
      await this.context.secrets.store(SECRET_PREFIX + config.name, password);
    }
    // Drop any cached driver so the new host/credentials take effect on next use.
    await this.closeDriver(config.name);
  }

  /**
   * Renames a connection: writes the new config (carrying over the stored
   * password when `password` is undefined) and drops the old entry + secret.
   */
  async renameConnection(oldName: string, config: ConnectionConfig, password?: string): Promise<void> {
    const resolved = password ?? (await this.context.secrets.get(SECRET_PREFIX + oldName)) ?? '';
    await this.saveConnection(config, resolved);
    if (oldName !== config.name) {
      await this.removeConnection(oldName);
    }
  }

  async removeConnection(name: string): Promise<void> {
    const connections = this.getConnections().filter((connection) => connection.name !== name);
    await this.writeConnections(connections);
    await this.context.secrets.delete(SECRET_PREFIX + name);
    await this.closeDriver(name);
  }

  /**
   * Opens a throwaway connection to validate the settings, then closes it.
   * `password: undefined` falls back to the stored secret (edit mode). Rejects
   * with the driver error, or a timeout, when the connection cannot be opened.
   */
  async testConnection(config: ConnectionConfig, password?: string): Promise<void> {
    const resolved = password ?? (await this.context.secrets.get(SECRET_PREFIX + config.name)) ?? '';
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
    const password = (await this.context.secrets.get(SECRET_PREFIX + name)) ?? '';
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
    return vscode.workspace
      .getConfiguration('dbStudio')
      .update('connections', connections, vscode.ConfigurationTarget.Global);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}
