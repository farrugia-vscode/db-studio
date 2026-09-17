# DB Studio

A lightweight, PHPStorm-style database explorer for VS Code - browse your schema, run SQL, and edit data inline. Supports **MySQL**, **MariaDB**, **PostgreSQL** and **SQLite**.

## Features

- **Multi-connection** sidebar (MySQL / MariaDB via `mysql2`, PostgreSQL via `pg`, SQLite via `node:sqlite`)
- **Connection form** (add/edit in one screen) with a **per-connection colour** shown on the tree icon
  and every related tab, and a **read-only** switch that blocks every write
- **Schema navigation**: connection → database/schema → table → columns (PK, type, nullability),
  views, routines, triggers, sequences; table designer for `CREATE` / `ALTER`
- **SQL console** per connection: schema-aware autocompletion, one result tab per statement,
  editable results (MySQL), formatter, shared query history with export
- **Editable data grid**: edit cells inline, JSON and long text in a modal, enum and foreign-key
  pickers, add / delete rows, undo / redo, then **Commit** - changes run as parameterized
  `UPDATE` / `INSERT` / `DELETE` by primary key (tables without a PK open read-only)
- **Grid navigation**: server-side `WHERE` / `ORDER BY`, pagination, per-column local filters,
  Excel-like cell selection, row selection from the gutter, fill-down, paste, format-aware copy
- Passwords stored in the OS secret storage, never in settings

## Architecture

TypeScript, bundled with esbuild. The design keeps responsibilities isolated (SRP) and depends on
abstractions (DIP):

- **Segmented driver interfaces** (`SqlDialect`, `SchemaIntrospector`, `StatementExecutor`,
  `Connectable`) - each consumer depends only on what it needs (ISP)
- **`DriverFactory`** - a registry keyed by driver kind; add an engine without touching a switch (OCP)
- **Edit Commands** (`UpdateEdit` / `DeleteEdit` / `InsertEdit`) - each edit builds its own
  parameterized statement via the dialect; `EditFactory` rebuilds them from the webview DTOs

```
src/
├── domain/          # driver interfaces, types, edit Commands + factory, webview protocols
├── drivers/         # MysqlDriver, PostgresDriver, SqliteDriver, DriverFactory
├── connections/     # ConnectionManager (config, secrets, live driver cache)
├── views/           # schema tree, connection form, data grid, SQL console, table designer
├── webview/         # browser-side scripts, bundled to media/*.js
└── extension.ts     # activation + command wiring
```

## Install (local)

```bash
git clone git@github.com:farrugia-vscode/db-studio.git ~/www/vscode-extensions/db-studio
cd ~/www/vscode-extensions/db-studio
bun install
bun run check                                   # type-check
bun run build                                   # out/extension.js + media/*.js
bunx @vscode/vsce package --no-dependencies     # db-studio-<version>.vsix
code --install-extension db-studio-<version>.vsix --force
```

Reload the window after an update (quit and relaunch when commands or menus changed).

Dev loop: `bun run watch` (rebuild on change), `bun run check` (type-check), `bun test` (unit tests).
Grid in a plain browser: `bun scripts/grid-harness.ts` then serve the folder and open `.harness/grid.html`
(`window.load(window.SAMPLE)` feeds it sample rows, `window.posted` collects what it sends).

## Usage

- **DB Studio: Add Connection** - pick the engine, fill the form, test, save
- Right-click a connection → **Edit Connection** (blank password keeps the stored one)
- Expand a connection to browse its schema; double-click a table to open its data
- Right-click a table → **Open Table Data**, **Show DDL**, **Export Data**; a schema → **SQL Console**

## License

MIT
