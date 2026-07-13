# DB Studio

A lightweight, PHPStorm-style database explorer for VS Code — browse your schema, run SQL, and (soon) edit data inline. Supports **MySQL**, **MariaDB** and **PostgreSQL**.

## Features (v0.0.1)

- **Multi-connection** sidebar (MySQL / MariaDB via `mysql2`, PostgreSQL via `pg`)
- **Schema navigation**: connection → database/schema → table → columns (PK, type, nullability)
- **Run SQL**: from the current selection, the active `.sql` file, or a prompt — results shown in a grid
- **Open table data**: browse rows of any table (row limit configurable)
- Passwords stored in the OS secret storage, never in settings

## Roadmap

- Editable data grid (edit cells, commit `UPDATE`/`DELETE`/`INSERT` by primary key)
- Schema-aware SQL autocompletion
- CSV / SQL export & import

## Install (local dev)

```bash
git clone git@github.com:farrugia-vscode/db-studio.git ~/www/vscode-extensions/db-studio
cd ~/www/vscode-extensions/db-studio
bun install   # or npm install
ln -s ~/www/vscode-extensions/db-studio ~/.vscode/extensions/db-studio
```

Reload VS Code. Open the **DB Studio** view in the activity bar and add a connection.

## Usage

- **DB Studio: Add Connection** — configure a MySQL/MariaDB or PostgreSQL connection
- Expand a connection in the sidebar to browse its schema
- Right-click a table → **Open Table Data**, or a connection → **Run SQL Query**

## License

MIT
