# DB Studio — Roadmap

Shared tracker. Updated every turn. `[x]` done · `[ ]` planned.

## Connections
- [x] Multi-connection sidebar (MySQL / MariaDB / PostgreSQL / SQLite via `node:sqlite`)
- [x] Connection form (add + edit, single screen)
- [x] Test connection button
- [x] Per-connection color (picker + swatches)
- [x] Editable name with rename (moves config + secret)
- [x] Driver icons (🐬 MySQL/MariaDB, 🐘 PostgreSQL, 📄 SQLite)
- [x] Read-only connections (every write blocked: grid, console, DDL)
- [x] Edit / Remove via right-click
- [x] Duplicate connection (config + password, unique name)
- [x] Find table / view across schemas (fuzzy quick-pick → opens data)
- [x] Group / reorder connections (Group field in the form, Move Up / Move Down)

## Schema tree
- [x] connection → database/schema → table → columns (PK, type, nullability)
- [x] Colored connection icon
- [x] Double-click a table → open its data
- [x] Show table DDL (right-click → Show DDL)
- [x] Drop / empty table (right-click, modal confirmation)
- [x] Table designer: create & modify tables (visual columns → CREATE / ALTER, preview + confirm)
- [x] Indexes, unique constraints and foreign keys in the designer
- [x] Views, procedures, functions, triggers, sequences (grouped folders, per non-empty family)
- [x] Views open their data; routines/triggers/sequences show read-only DDL
- [x] Select which databases/schemas to display per connection
- [x] Show / hide columns in the data grid (toolbar checklist)
- [x] Search across the tree via "Find table…" (fuzzy quick-pick)
- [x] Refresh a single node, Copy name / Copy DDL, row-count estimate on tables (`dbStudio.showRowCounts`)

## Data grid
- [x] Editable cells, add + delete rows, Commit (UPDATE / INSERT / DELETE by PK)
- [x] `<generated>` for auto-increment / identity columns on new rows
- [x] Revert merged into Reload
- [x] Resizable columns (drag + double-click auto-fit)
- [x] Flat redesign: spacing, header, zebra + hover, add-row footer
- [x] Connection color cue (3px strip on windows) + live re-tint on color change
- [x] Red highlight for rows pending deletion; drop uncommitted new rows on delete
- [x] Horizontal scroll (table width synced to columns on resize)
- [x] Filter = raw SQL `WHERE` condition, run on Enter (server-side)
- [x] Pagination (page size 10/20/50/100/500/No + first / prev / next / last)
- [x] Edit a cell on double-click (single click selects / highlights)
- [x] JSON cell editor: modal, live validity, editor-like auto-indent (Enter/Tab)
- [x] Enum columns edited via a dropdown
- [x] Date columns: locale-formatted display (`dbStudio.dateLocale`), raw ISO editing
- [x] Columns auto-fit to content on load, capped at a max width
- [x] Sort by column (click header → ASC / DESC / none, server-side)
- [x] Excel-like rectangular selection (mouse + Shift), fill-down (Ctrl+D), paste (Ctrl+V)
- [x] Format-aware copy (Ctrl+C → TSV / CSV / JSON / INSERT, chosen in the toolbar)
- [x] Undo / redo of cell & row edits (Ctrl+Z / Ctrl+Y, toolbar buttons)
- [x] Searchable foreign-key picker (key + descriptive label, server-side search) and enum picker
- [x] FK / index badges in headers, SQL type under each column name, stable column widths
- [x] Line-number gutter; row selection (click, drag, Shift, Ctrl) → Backspace deletes, edits apply to every selected row
- [x] Long text (TEXT/CLOB) and JSON edited in a modal (Esc / Ctrl+Enter)
- [x] Right-click: apply a cell value in WHERE, delete / restore selected rows
- [x] Keyboard navigation between cells (arrows, Tab, Shift+arrows, Home/End, Page Up/Down; Enter/Tab step after a commit)
- [x] Set NULL / set empty string explicitly from the context menu (selection-wide)
- [x] Row selection honoured by copy / export / duplicate
- [x] FIND box: text search across the loaded rows (Ctrl+F)

## SQL
- [x] Run SQL from selection / active `.sql` file / prompt → results grid (tinted)
- [x] Full SQL console window (per-connection, auto-saved editor, Ctrl+Enter run)
- [x] Schema-aware autocompletion (tables, columns, keywords; alias-aware `.` columns)
- [x] Query history (per connection, timestamps + row counts, filter, export CSV/MD, clear)
- [x] One result tab per `;`-separated statement; editable results when the PK is in the result (MySQL)
- [x] SQL formatter (Alt+Shift+F), syntax highlighting, resizable editor
- [x] Execution time per statement (result footer, tab tooltip, history), Explain button (Ctrl+Shift+Enter)
- [x] Cancel a running statement (MySQL KILL QUERY, PostgreSQL pg_cancel_backend; not SQLite)
- [x] Named snippets, shared across the workspace (side panel: save, rename, delete, filter)

## Import / export
- [x] Export a table / view to CSV, JSON or SQL inserts (right-click → Export Data)
- [~] SQL dump — planned (full-database dump; per-table SQL export already available)
- [x] ~~CSV import~~ — dropped (dump-based workflow preferred)

## Color recognition note
VS Code exposes no API to color an editor **tab** or a **tree row/panel** background.
So the connection color is surfaced where it's actually possible: a tinted **icon** in
the tree (todo: colored label via FileDecorationProvider) and a 3px color **strip** on
each related window (grid, results).

## Infra
- [x] TypeScript + esbuild (bundled), SOLID layering
- [x] Drivers behind segmented interfaces (ISP) + `DriverFactory` (OCP)
- [x] Edits as Commands + `EditFactory`
- [x] `grid.ts` split into modules (pure logic, pickers, value modal); `bun test` on the pure logic; browser harness for both webviews
