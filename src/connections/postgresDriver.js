const { Client } = require('pg');

/**
 * PostgreSQL driver.
 * A connection is bound to a single database; a "namespace" maps to a schema.
 */
class PostgresDriver {
  constructor(config, password) {
    this.config = config;
    this.password = password;
    this.client = null;
  }

  async connect() {
    if (this.client) {
      return;
    }
    this.client = new Client({
      host: this.config.host,
      port: this.config.port || 5432,
      user: this.config.user,
      password: this.password,
      database: this.config.database || 'postgres',
    });
    await this.client.connect();
  }

  async close() {
    if (!this.client) {
      return;
    }
    await this.client.end();
    this.client = null;
  }

  async listNamespaces() {
    await this.connect();
    const result = await this.client.query(
      `SELECT schema_name AS name FROM information_schema.schemata
       WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
         AND schema_name NOT LIKE 'pg_%'
       ORDER BY schema_name`,
    );
    return result.rows.map((row) => row.name);
  }

  async listTables(namespace) {
    await this.connect();
    const result = await this.client.query(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = $1 ORDER BY table_name`,
      [namespace],
    );
    return result.rows.map((row) => row.name);
  }

  async listColumns(namespace, table) {
    await this.connect();
    const result = await this.client.query(
      `SELECT c.column_name AS name, c.data_type AS type, c.is_nullable AS nullable,
              (pk.column_name IS NOT NULL) AS is_primary_key
       FROM information_schema.columns c
       LEFT JOIN (
         SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
         WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2
       ) pk ON pk.column_name = c.column_name
       WHERE c.table_schema = $1 AND c.table_name = $2
       ORDER BY c.ordinal_position`,
      [namespace, table],
    );
    return result.rows.map((row) => ({
      name: row.name,
      type: row.type,
      isNullable: row.nullable === 'YES',
      isPrimaryKey: row.is_primary_key === true,
    }));
  }

  quoteIdentifier(identifier) {
    return '"' + identifier.replace(/"/g, '""') + '"';
  }

  buildTableRef(namespace, table) {
    return `${this.quoteIdentifier(namespace)}.${this.quoteIdentifier(table)}`;
  }

  async query(sql) {
    await this.connect();
    const result = await this.client.query(sql);
    if (!Array.isArray(result.rows)) {
      return { columns: [], rows: [], affectedRows: result.rowCount };
    }
    const columns = result.fields ? result.fields.map((field) => field.name) : Object.keys(result.rows[0] || {});
    return { columns, rows: result.rows, affectedRows: result.rowCount };
  }
}

module.exports = { PostgresDriver };
