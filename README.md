# DB Studio

A lightweight, PHPStorm-style database explorer for VS Code — browse your schema, run SQL, and edit data inline. Supports **MySQL**, **MariaDB** and **PostgreSQL**.

## Features

- **Multi-connection** sidebar (MySQL / MariaDB via `mysql2`, PostgreSQL via `pg`)
- **Schema navigation**: connection → database/schema → table → columns (PK, type, nullability)
- **Run SQL**: from the current selection, the active `.sql` file, or a prompt — results in a grid
- **Editable data grid**: edit cells, add and delete rows, then **Commit** — changes are applied as
  parameterized `UPDATE` / `INSERT` / `DELETE` by primary key (tables without a PK open read-only)
- Passwords stored in the OS secret storage, never in settings

## Roadmap

- Schema-aware SQL autocompletion
- CSV / SQL export & import

## Architecture

TypeScript, bundled with esbuild. The design keeps responsibilities isolated (SRP) and depends on
abstractions (DIP):

- **Segmented driver interfaces** (`SqlDialect`, `SchemaIntrospector`, `StatementExecutor`,
  `Connectable`) — each consumer depends only on what it needs (ISP)
- **`DriverFactory`** — a registry keyed by driver kind; add an engine without touching a switch (OCP)
- **Edit Commands** (`UpdateEdit` / `DeleteEdit` / `InsertEdit`) — each edit builds its own
  parameterized statement via the dialect; `EditFactory` rebuilds them from the webview DTOs

```
src/
├── domain/          # driver interfaces, types, edit Commands + factory, webview protocol
├── drivers/         # MysqlDriver, PostgresDriver, DriverFactory
├── connections/     # ConnectionManager (config, secrets, live driver cache)
├── views/           # schema tree, results view, editable data grid host
├── webview/         # grid.ts (browser-side, bundled to media/grid.js)
└── extension.ts     # activation + command wiring
```

## Install (local dev)

```bash
git clone git@github.com:farrugia-vscode/db-studio.git ~/www/vscode-extensions/db-studio
cd ~/www/vscode-extensions/db-studio
bun install
bun run build         # compiles TS → out/ and the webview → media/grid.js
ln -s ~/www/vscode-extensions/db-studio ~/.vscode/extensions/db-studio
```

Fully reload VS Code (quit + relaunch for new views/menus). Open the **DB Studio** view in the
activity bar and add a connection.

Dev loop: `bun run watch` (rebuild on change) and `bun run check` (type-check).

## Usage

- **DB Studio: Add Connection** — configure a MySQL/MariaDB or PostgreSQL connection
- Expand a connection to browse its schema
- Right-click a table → **Open Table Data** to edit, or a connection → **Run SQL Query**

## License

MIT
