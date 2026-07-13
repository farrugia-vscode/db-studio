import type { DatabaseDriver } from '../domain/driver';
import type { ConnectionConfig, DriverKind } from '../domain/types';
import { MysqlDriver } from './mysqlDriver';
import { PostgresDriver } from './postgresDriver';

type DriverCreator = (config: ConnectionConfig, password: string) => DatabaseDriver;

/**
 * Creates drivers from a registry keyed by {@link DriverKind}. Supporting a new
 * engine means registering a creator here — no consumer switch to touch (OCP).
 */
export class DriverFactory {
  private readonly creators = new Map<DriverKind, DriverCreator>([
    ['mysql', (config, password) => new MysqlDriver(config, password)],
    ['postgres', (config, password) => new PostgresDriver(config, password)],
  ]);

  make(config: ConnectionConfig, password: string): DatabaseDriver {
    const creator = this.creators.get(config.driver);
    if (!creator) {
      throw new Error(`Unsupported driver: ${config.driver}`);
    }
    return creator(config, password);
  }
}
