const vscode = require('vscode');
const { MysqlDriver } = require('./mysqlDriver');
const { PostgresDriver } = require('./postgresDriver');

const SECRET_PREFIX = 'dbStudio.password.';

/**
 * Owns connection configuration, secret passwords and live driver instances.
 * One driver instance is cached per connection name.
 */
class ConnectionManager {
  constructor(context) {
    this.context = context;
    this.drivers = new Map();
  }

  getConnections() {
    return vscode.workspace.getConfiguration('dbStudio').get('connections', []);
  }

  getConnection(name) {
    return this.getConnections().find((connection) => connection.name === name);
  }

  async saveConnection(config, password) {
    const connections = this.getConnections().filter((connection) => connection.name !== config.name);
    connections.push(config);
    await vscode.workspace
      .getConfiguration('dbStudio')
      .update('connections', connections, vscode.ConfigurationTarget.Global);
    await this.context.secrets.store(SECRET_PREFIX + config.name, password);
  }

  async removeConnection(name) {
    const connections = this.getConnections().filter((connection) => connection.name !== name);
    await vscode.workspace
      .getConfiguration('dbStudio')
      .update('connections', connections, vscode.ConfigurationTarget.Global);
    await this.context.secrets.delete(SECRET_PREFIX + name);
    await this.closeDriver(name);
  }

  async getDriver(name) {
    const cached = this.drivers.get(name);
    if (cached) {
      return cached;
    }
    const config = this.getConnection(name);
    if (!config) {
      throw new Error(`Unknown connection: ${name}`);
    }
    const password = (await this.context.secrets.get(SECRET_PREFIX + name)) || '';
    const driver = this.createDriver(config, password);
    this.drivers.set(name, driver);
    return driver;
  }

  createDriver(config, password) {
    if (config.driver === 'mysql') {
      return new MysqlDriver(config, password);
    }
    if (config.driver === 'postgres') {
      return new PostgresDriver(config, password);
    }
    throw new Error(`Unsupported driver: ${config.driver}`);
  }

  async closeDriver(name) {
    const driver = this.drivers.get(name);
    if (!driver) {
      return;
    }
    await driver.close();
    this.drivers.delete(name);
  }

  async closeAll() {
    for (const name of this.drivers.keys()) {
      await this.closeDriver(name);
    }
  }
}

module.exports = { ConnectionManager };
