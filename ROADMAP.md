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
- [ ] Select which databases/schemas to display per connection
- [ ] Show indexes, foreign keys, views
- [ ] Filter/search the tree

## Data grid
- [x] Editable cells, add + delete rows, Commit (UPDATE / INSERT / DELETE by PK)
- [x] `<generated>` for auto-increment / identity columns on new rows
- [x] Revert merged into Reload
- [x] Resizable columns (drag + double-click auto-fit)
- [x] Flat redesign: spacing, header, zebra + hover, add-row footer
- [x] Window tinted with the connection color
- [x] Horizontal scroll
- [ ] Filter bar (quick filter / per-column)
- [ ] Pagination (offset/limit or keyset)
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

## Tree color note
VS Code's TreeView API has no per-row background; connection color is shown via the
tinted **icon** and the tinted **windows** (grid, results). A full colored tree row
is not possible through the API.

## Infra
- [x] TypeScript + esbuild (bundled), SOLID layering
- [x] Drivers behind segmented interfaces (ISP) + `DriverFactory` (OCP)
- [x] Edits as Commands + `EditFactory`
