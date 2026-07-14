# DB Studio — Roadmap

Shared tracker. Updated every turn. `[x]` done · `[ ]` planned.

## Connections
- [x] Multi-connection sidebar (MySQL / MariaDB / PostgreSQL)
- [x] Connection form (add + edit, single screen)
- [x] Test connection button
- [x] Per-connection color (picker + swatches)
- [x] Editable name with rename (moves config + secret)
- [x] Driver icons (🐬 MySQL/MariaDB, 🐘 PostgreSQL)
- [x] Edit / Remove via right-click
- [ ] Duplicate connection
- [ ] Group / reorder connections

## Schema tree
- [x] connection → database/schema → table → columns (PK, type, nullability)
- [x] Colored connection icon
- [x] Double-click a table → open its data
- [x] Show table DDL (right-click → Show DDL)
- [x] Drop / empty table (right-click, modal confirmation)
- [ ] Edit DDL / alter table (to spec)
- [ ] Select which databases/schemas to display per connection
- [ ] Show / hide columns in the data grid
- [ ] Show indexes, foreign keys, views
- [ ] Filter/search the tree

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
- [ ] Multi-cell selection & fill (Excel-style) — to spec later
- [ ] Hide / show columns
- [ ] Sort by column (click header)
- [ ] Copy cell / row, export selection

## SQL
- [x] Run SQL from selection / active `.sql` file / prompt → results grid (tinted)
- [ ] Full SQL console window (editor pane, not a tiny input)
- [ ] Schema-aware autocompletion
- [ ] Query history

## Import / export
- [ ] CSV export & import
- [ ] SQL dump

## Color recognition note
VS Code exposes no API to color an editor **tab** or a **tree row/panel** background.
So the connection color is surfaced where it's actually possible: a tinted **icon** in
the tree (todo: colored label via FileDecorationProvider) and a 3px color **strip** on
each related window (grid, results).

## Infra
- [x] TypeScript + esbuild (bundled), SOLID layering
- [x] Drivers behind segmented interfaces (ISP) + `DriverFactory` (OCP)
- [x] Edits as Commands + `EditFactory`
