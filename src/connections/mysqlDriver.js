const mysql = require('mysql2/promise');

/**
 * MySQL / MariaDB driver.
 * A "namespace" maps to a MySQL database (schema).
 */
class MysqlDriver {
  constructor(config, password) {
    this.config = config;
    this.password = password;
    this.connection = null;
  }

  async connect() {
    if (this.connection) {
      return;
    }
    this.connection = await mysql.createConnection({
      host: this.config.host,
      port: this.config.port || 3306,
      user: this.config.user,
      password: this.password,
      database: this.config.database || undefined,
      multipleStatements: false,
    });
  }

  async close() {
    if (!this.connection) {
      return;
    }
    await this.connection.end();
    this.connection = null;
  }

  async listNamespaces() {
    await this.connect();
    const hidden = ['information_schema', 'performance_schema', 'mysql', 'sys'];
    const [rows] = await this.connection.query('SHOW DATABASES');
    return rows
      .map((row) => Object.values(row)[0])
      .filter((name) => !hidden.includes(name));
  }

  async listTables(namespace) {
    await this.connect();
    const [rows] = await this.connection.query(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name',
      [namespace],
    );
    return rows.map((row) => row.name);
  }

  async listColumns(namespace, table) {
    await this.connect();
    const [rows] = await this.connection.query(
      `SELECT column_name AS name, column_type AS type, is_nullable AS nullable, column_key AS keyType
       FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ?
       ORDER BY ordinal_position`,
      [namespace, table],
    );
    return rows.map((row) => ({
      name: row.name,
      type: row.type,
      isNullable: row.nullable === 'YES',
      isPrimaryKey: row.keyType === 'PRI',
    }));
  }

  quoteIdentifier(identifier) {
    return '`' + identifier.replace(/`/g, '``') + '`';
  }

  buildTableRef(namespace, table) {
    return `${this.quoteIdentifier(namespace)}.${this.quoteIdentifier(table)}`;
  }

  async query(sql) {
    await this.connect();
    const [rows, fields] = await this.connection.query(sql);
    if (!Array.isArray(rows)) {
      return { columns: [], rows: [], affectedRows: rows.affectedRows };
    }
    const columns = fields ? fields.map((field) => field.name) : Object.keys(rows[0] || {});
    return { columns, rows };
  }
}

module.exports = { MysqlDriver };
