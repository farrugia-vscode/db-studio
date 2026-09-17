import type { CopyFormat, ExtensionToWebview, FkOption, WebviewToExtension } from '../domain/gridProtocol';
import type { ColumnMeta, ForeignKeyMeta, IncomingForeignKey, Row } from '../domain/types';
import { element } from './grid/dom';
import {
  compactType,
  dateInputType,
  enumValues,
  isDateColumn,
  isNumericColumn,
  isPlainTextColumn,
  valueEditorFor,
  whereLiteral,
  type ValueEditor,
} from './grid/columnTypes';
import { formatDate, fromDateInputValue, toDateInputValue } from './grid/dates';
import { decodeValue, displayValue, encodeValue } from './grid/filterValues';
import {
  FK_SVG,
  FUNNEL_SVG,
  INDEX_SVG,
  MENU_EMPTY_SVG,
  MENU_FILTER_SVG,
  MENU_GOTO_SVG,
  MENU_NULL_SVG,
  MENU_RESTORE_SVG,
  MENU_ROWS_SVG,
  MENU_TRASH_SVG,
} from './grid/icons';
import { parseOrder } from './grid/orderBy';
import { openEnumPopup, openFkPopup } from './grid/pickers';
import { openValueModal } from './grid/valueModal';
import {
  cloneModels,
  computeEdits,
  defaultForNewRow,
  hasLocalChanges,
  toCellRow,
  type CellValue,
  type GridCell,
  type RowModel,
} from './grid/rowModel';

interface VsCodeApi {
  postMessage(message: WebviewToExtension): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

let columns: ColumnMeta[] = [];
// The columns actually shown (ordered by columnOrder, minus the user-hidden ones); rebuilt on each render.
let renderColumns: ColumnMeta[] = [];
// Display order of columns by name; reordered by dragging headers.
let columnOrder: string[] = [];
const hiddenColumns = new Set<string>();
// Per-column local filter: allowed values (Excel-style). Absent = column not filtered.
const columnFilters = new Map<string, Set<CellValue>>();
// The column name currently being dragged to a new position.
let dragColumn: string | null = null;
let pkColumns: string[] = [];
let namespace = '';
let foreignKeys: ForeignKeyMeta[] = [];
let incomingForeignKeys: IncomingForeignKey[] = [];
// Columns that participate in any index — drives the header index badge.
let indexedColumns = new Set<string>();
// Read-only connection → all editing is disabled (treated like a table with no primary key).
let readOnly = false;
let rowModels: RowModel[] = [];
let hasPrimaryKey = false;
let colElements: HTMLTableColElement[] = [];
// Measured (or user-resized) width per column name, kept across reloads so sorting/paging
// doesn't re-measure against the new page's rows and shift columns by a few pixels.
const columnWidths = new Map<string, number>();
let dateLocale = '';

const MIN_WIDTH = 56;
const INITIAL_MAX_WIDTH = 360;
const CELL_PADDING = 34;
// Width the header reserves for its funnel + sort buttons, and extra for the PK key glyph.
const HEADER_CONTROLS = 46;
const PK_KEY_WIDTH = 18;
// Extra header room reserved for a foreign-key / index badge.
const BADGE_WIDTH = 16;
const measureCtx = document.createElement('canvas').getContext('2d');
let cellFont = '12px monospace';
// The header label is bold with letter-spacing, so it measures wider than a cell value.
let headerFont = 'bold 12px monospace';

const grid = element<HTMLTableElement>('grid');
const notice = element<HTMLDivElement>('notice');
const status = element<HTMLSpanElement>('status');
const commitButton = element<HTMLButtonElement>('commit');
const revertButton = element<HTMLButtonElement>('revert');
const undoButton = element<HTMLButtonElement>('undo');
const redoButton = element<HTMLButtonElement>('redo');
const pendingDrawer = element<HTMLDivElement>('pendingDrawer');
const pendingHeader = element<HTMLDivElement>('pendingHeader');
const pendingChevron = element<HTMLSpanElement>('pendingChevron');
const pendingTitle = element<HTMLSpanElement>('pendingTitle');
const pendingBody = element<HTMLPreElement>('pendingBody');
let pendingExpanded = false;
let previewTimer = 0;
const reloadButton = element<HTMLButtonElement>('reload');
const filterInput = element<HTMLInputElement>('filter');
const orderByInput = element<HTMLInputElement>('orderBy');
const pageSearchInput = element<HTMLInputElement>('pageSearch');
const pageSearchCount = element<HTMLSpanElement>('pageSearchCount');
// Case-insensitive needle matched against every cell of the loaded rows (client-side only).
let pageSearch = '';
const pagerFirst = element<HTMLButtonElement>('pagerFirst');
const pagerPrev = element<HTMLButtonElement>('pagerPrev');
const pagerNext = element<HTMLButtonElement>('pagerNext');
const pagerLast = element<HTMLButtonElement>('pagerLast');
const pagerInfo = element<HTMLSpanElement>('pagerInfo');
const pageSizeInput = element<HTMLSelectElement>('pageSize');
const copyFormatSelect = element<HTMLSelectElement>('copyFormat');
const exportButton = element<HTMLButtonElement>('exportBtn');
const colMenuToggle = element<HTMLButtonElement>('colMenuToggle');
const colMenu = element<HTMLDivElement>('colMenu');

let total = 0;
let offset = 0;
let pageSize = 100;
// The active ORDER BY clause (without the keyword); drives header arrows and the order-by box.
let orderBy = '';

// Excel-like rectangular selection (cell coordinates into rowModels / columns).
let selAnchor: { r: number; c: number } | null = null;
let selFocus: { r: number; c: number } | null = null;
let selecting = false;
// Whole-row selection driven by the gutter (line numbers): click, Shift/drag for a range,
// Ctrl/Cmd+click to toggle rows. Backspace deletes them; editing a cell in one of them edits them all.
let selectedRows = new Set<number>();
let rowAnchor: number | null = null;
// The moving end of a row range (anchor stays put while Shift/drag/arrows extend from it).
let rowFocus: number | null = null;
let rowSelecting = false;
// Rows already selected when a Ctrl+drag started, so the drag adds to them instead of replacing them.
let rowSelectionBase: Set<number> | null = null;
// When editing was started on a multi-cell selection (or on a row selection), the committed value
// fills every one of these cells.
let bulkCells: GridCell[] | null = null;

// Grid-level undo/redo of structural edits (cell change, add/delete row, fill, paste).
// In-cell text editing keeps the field's own native undo while the input is focused.
const UNDO_LIMIT = 100;
let undoStack: RowModel[][] = [];
let redoStack: RowModel[][] = [];

commitButton.addEventListener('click', commit);
revertButton.addEventListener('click', () => api.postMessage({ type: 'reload' }));
undoButton.addEventListener('click', undo);
redoButton.addEventListener('click', redo);
// The pending drawer rolls up/down like the terminal panel.
pendingHeader.addEventListener('click', () => setPendingExpanded(!pendingExpanded));

function setPendingExpanded(expanded: boolean): void {
  pendingExpanded = expanded;
  pendingBody.hidden = !expanded;
  pendingChevron.textContent = expanded ? '▾' : '▸';
  if (expanded) {
    requestEditsPreview();
  }
}

function requestEditsPreview(): void {
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => api.postMessage({ type: 'previewEdits', edits: computeEdits(rowModels, columns, pkColumns) }), 120);
}
reloadButton.addEventListener('click', () => api.postMessage({ type: 'reload' }));
// The 'search' event fires on Enter and when the native clear (×) is clicked.
filterInput.addEventListener('search', () => api.postMessage({ type: 'filter', value: filterInput.value }));
orderByInput.addEventListener('search', () => api.postMessage({ type: 'order', orderBy: orderByInput.value }));
pageSearchInput.addEventListener('input', () => {
  pageSearch = pageSearchInput.value.trim().toLowerCase();
  render();
  renderSelection();
});
pageSearchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    pageSearchInput.value = '';
    pageSearchInput.dispatchEvent(new Event('input'));
    pageSearchInput.blur();
  }
});
exportButton.addEventListener('click', exportSelection);

colMenuToggle.addEventListener('click', (event) => {
  event.stopPropagation();
  colMenu.hidden = !colMenu.hidden;
  if (!colMenu.hidden) {
    buildColMenu();
    colMenu.querySelector<HTMLInputElement>('input[type=checkbox]')?.focus();
  }
});
colMenu.addEventListener('keydown', onColMenuKeydown);
// Click anywhere else closes the column menu.
document.addEventListener('mousedown', (event) => {
  if (!colMenu.hidden && !colMenu.contains(event.target as Node) && event.target !== colMenuToggle) {
    colMenu.hidden = true;
  }
});

grid.addEventListener('mousedown', onGridMouseDown);
grid.addEventListener('mousemove', onGridMouseMove);
document.addEventListener('mouseup', () => {
  selecting = false;
  rowSelecting = false;
  rowSelectionBase = null;
});
document.addEventListener('keydown', onGridKeydown);
grid.addEventListener('contextmenu', onGridContextMenu);

// Floating right-click menu for foreign-key navigation.
const cellMenu = document.createElement('div');
cellMenu.className = 'cell-menu';
cellMenu.hidden = true;
document.body.appendChild(cellMenu);
// Floating per-column local filter popup.
const filterPop = document.createElement('div');
filterPop.className = 'filter-pop';
filterPop.hidden = true;
document.body.appendChild(filterPop);
document.addEventListener('mousedown', (event) => {
  const target = event.target as Node;
  if (!cellMenu.hidden && !cellMenu.contains(target)) {
    cellMenu.hidden = true;
  }
  if (!filterPop.hidden && !filterPop.contains(target) && !(target instanceof HTMLElement && target.closest('.filter-btn'))) {
    filterPop.hidden = true;
  }
});

function onGridMouseDown(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest('button')) {
    return; // the × button acts on click; a press on it must not start a selection
  }
  const gutter = target.closest('td[data-row]') as HTMLTableCellElement | null;
  if (gutter) {
    onGutterMouseDown(event, Number(gutter.dataset.row));
    return;
  }
  const td = target.closest('td[data-r]') as HTMLTableCellElement | null;
  if (!td) {
    return;
  }
  const cell = { r: Number(td.dataset.r), c: Number(td.dataset.c) };
  // Clicking a cell drops the row selection, unless the cell sits in a selected row: then the rows
  // stay selected so an edit on that cell applies to every one of them.
  if (!selectedRows.has(cell.r)) {
    clearRowSelection();
  }
  if (event.shiftKey && selAnchor) {
    selFocus = cell;
  } else {
    selAnchor = cell;
    selFocus = cell;
  }
  selecting = true;
  renderSelection();
}

function onGutterMouseDown(event: MouseEvent, r: number): void {
  selAnchor = null;
  selFocus = null;
  if (event.shiftKey && rowAnchor !== null) {
    rowSelectionBase = null;
    selectedRows = rowRange(rowAnchor, r);
  } else if (event.ctrlKey || event.metaKey) {
    rowSelectionBase = new Set(selectedRows);
    if (selectedRows.has(r)) {
      selectedRows.delete(r);
    } else {
      selectedRows.add(r);
    }
    rowAnchor = r;
  } else {
    rowSelectionBase = null;
    selectedRows = new Set([r]);
    rowAnchor = r;
  }
  rowFocus = r;
  rowSelecting = true;
  renderSelection();
}

function rowRange(from: number, to: number): Set<number> {
  const rows = new Set<number>();
  for (let r = Math.min(from, to); r <= Math.max(from, to); r += 1) {
    rows.add(r);
  }
  return rows;
}

function clearRowSelection(): void {
  selectedRows = new Set();
  rowAnchor = null;
  rowFocus = null;
}

function onGridMouseMove(event: MouseEvent): void {
  const td = (event.target as HTMLElement).closest('td[data-r], td[data-row]') as HTMLTableCellElement | null;
  if (!td) {
    return;
  }
  const r = Number(td.dataset.row ?? td.dataset.r);
  if (rowSelecting && rowAnchor !== null) {
    // Dragging from the gutter sweeps a range (over the numbers or across the cells); with Ctrl it
    // is added to what was already selected.
    selectedRows = new Set([...(rowSelectionBase ?? []), ...rowRange(rowAnchor, r)]);
    rowFocus = r;
    renderSelection();
    return;
  }
  if (selecting && td.dataset.r !== undefined) {
    selFocus = { r, c: Number(td.dataset.c) };
    renderSelection();
  }
}

function onGridKeydown(event: KeyboardEvent): void {
  const active = document.activeElement;
  // Any real text field owns its keystrokes — a cell being edited, the WHERE/ORDER BY inputs,
  // the JSON textarea. Only then do the grid's selection shortcuts kick in.
  const editing =
    (active instanceof HTMLInputElement && !active.readOnly) ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement;
  if (event.ctrlKey || event.metaKey) {
    if (editing) {
      return; // editing a cell — let the input handle its own shortcuts (native undo included)
    }
    // Ctrl+Home / Ctrl+End jump to the first / last row.
    if (selRect() && moveCellSelection(event)) {
      event.preventDefault();
      return;
    }
    onGridShortcut(event);
    return;
  }
  if (editing) {
    return;
  }
  // A row selection owns Backspace/Delete (delete the rows) and Escape (drop the selection).
  if (selectedRows.size > 0 && (event.key === 'Delete' || event.key === 'Backspace')) {
    event.preventDefault();
    deleteSelectedRows();
    return;
  }
  if (selectedRows.size > 0 && event.key === 'Escape') {
    clearRowSelection();
    renderSelection();
    return;
  }
  // Duplicate the selected row(s) as pending inserts (VS Code's Shift+Alt+↓/↑ "copy line").
  if (event.altKey && event.shiftKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    duplicateSelectedRows(event.key === 'ArrowUp');
    return;
  }
  if (selectedRows.size > 0 && !selRect() && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    moveRowSelection(event.key === 'ArrowDown' ? 1 : -1, event.shiftKey);
    return;
  }
  if (!selRect()) {
    return;
  }
  if (moveCellSelection(event)) {
    event.preventDefault();
    return;
  }
  // Typing over a selection edits the lead cell; a rectangular selection fills every cell on commit.
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    clearSelectionCells();
  } else if (event.key === 'Enter' || event.key === 'F2') {
    event.preventDefault();
    beginSelectionEdit(null);
  } else if (event.key.length === 1 && !event.altKey) {
    event.preventDefault();
    beginSelectionEdit(event.key);
  }
}

// Arrows move the lead cell (Shift extends the rectangle), Tab/Shift+Tab step sideways, Home/End
// jump to the first/last column, Page Up/Down by a screenful. Returns false for any other key.
function moveCellSelection(event: KeyboardEvent): boolean {
  const lead = selFocus ?? selAnchor;
  if (!lead) {
    return false;
  }
  const lastRow = rowModels.length - 1;
  const lastCol = renderColumns.length - 1;
  const page = Math.max(1, Math.floor(gridScrollHeight() / ROW_HEIGHT_ESTIMATE) - 1);
  const targets: Record<string, GridCell | undefined> = {
    ArrowUp: { r: lead.r - 1, c: lead.c },
    ArrowDown: { r: lead.r + 1, c: lead.c },
    ArrowLeft: { r: lead.r, c: lead.c - 1 },
    ArrowRight: { r: lead.r, c: lead.c + 1 },
    Tab: { r: lead.r, c: lead.c + (event.shiftKey ? -1 : 1) },
    Home: { r: event.ctrlKey ? 0 : lead.r, c: 0 },
    End: { r: event.ctrlKey ? lastRow : lead.r, c: lastCol },
    PageUp: { r: lead.r - page, c: lead.c },
    PageDown: { r: lead.r + page, c: lead.c },
  };
  const target = targets[event.key];
  if (!target) {
    return false;
  }
  const next = { r: Math.min(lastRow, Math.max(0, target.r)), c: Math.min(lastCol, Math.max(0, target.c)) };
  // Shift extends from the anchor (never for Tab, which always moves a single cell).
  if (event.shiftKey && event.key !== 'Tab' && selAnchor) {
    selFocus = next;
  } else {
    selAnchor = next;
    selFocus = next;
  }
  clearRowSelection();
  renderSelection();
  scrollCellIntoView(next);
  return true;
}

// Up/Down walk the row selection (single row); Shift moves the range's focus end from the anchor.
function moveRowSelection(step: number, extend: boolean): void {
  const from = rowFocus ?? rowAnchor ?? 0;
  const next = Math.min(rowModels.length - 1, Math.max(0, from + step));
  if (extend && rowAnchor !== null) {
    selectedRows = rowRange(rowAnchor, next);
  } else {
    selectedRows = new Set([next]);
    rowAnchor = next;
  }
  rowFocus = next;
  renderSelection();
  scrollCellIntoView({ r: next, c: 0 });
}

const ROW_HEIGHT_ESTIMATE = 36;

function gridScrollHeight(): number {
  return grid.parentElement?.clientHeight ?? window.innerHeight;
}

function scrollCellIntoView(cell: GridCell): void {
  grid
    .querySelector(`td[data-r="${cell.r}"][data-c="${cell.c}"]`)
    ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function onGridShortcut(event: KeyboardEvent): void {
  const key = event.key.toLowerCase();
  if (key === 'f') {
    event.preventDefault();
    pageSearchInput.focus();
    pageSearchInput.select();
    return;
  }
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault();
    undo();
    return;
  }
  if (key === 'y' || (key === 'z' && event.shiftKey)) {
    event.preventDefault();
    redo();
    return;
  }
  // Copy works on a row selection too; fill-down and paste need a cell rectangle.
  if (key === 'c') {
    event.preventDefault();
    copySelection();
    return;
  }
  if (!selRect()) {
    return;
  }
  if (key === 'd') {
    event.preventDefault();
    fillDown();
  } else if (key === 'v') {
    event.preventDefault();
    void pasteSelection();
  }
}

// Start editing the lead cell of the current selection, optionally seeded with a typed character.
// Long values (JSON, TEXT) open their modal instead; dates and enums keep their double-click /
// dropdown editors.
function beginSelectionEdit(seed: string | null): void {
  const rect = selRect();
  if (!rect || !hasPrimaryKey) {
    return;
  }
  const lead = selFocus ?? selAnchor!;
  const column = renderColumns[lead.c];
  const model = rowModels[lead.r];
  if (!model || !isCellEditable(model, column)) {
    return;
  }
  const input = cellInputAt(lead.r, lead.c);
  if (!input) {
    return;
  }
  const valueEditor = valueEditorFor(column.type, model.values[column.name]);
  if (valueEditor) {
    editInModal(valueEditor, model, column, input, input.closest('td')!, seed);
    return;
  }
  if (!isPlainTextColumn(column.type)) {
    return;
  }
  bulkCells = bulkTargetsFor(lead) ?? (rect.r1 !== rect.r2 || rect.c1 !== rect.c2 ? rectCells(rect) : null);
  pushUndo();
  input.readOnly = false;
  if (seed !== null) {
    input.value = seed;
    input.dispatchEvent(new Event('input'));
  }
  input.focus();
  const end = input.value.length;
  input.setSelectionRange(end, end);
}

// Delete/Backspace over a selection clears every editable cell (NULL when nullable, else empty).
function clearSelectionCells(): void {
  const rect = selRect();
  if (!rect || !hasPrimaryKey) {
    return;
  }
  pushUndo();
  applyBulkEdit(rectCells(rect), '');
}

// Backspace/Delete on a row selection marks the rows deleted (uncommitted inserts are just dropped).
// When every selected row is already marked, the key restores them instead, like the × button.
function deleteSelectedRows(): void {
  if (!hasPrimaryKey || selectedRows.size === 0) {
    return;
  }
  pushUndo();
  const targets = [...selectedRows].map((r) => rowModels[r]).filter((model): model is RowModel => model !== undefined);
  const isRestore = targets.every((model) => model.deleted);
  const dropped = new Set<RowModel>();
  for (const model of targets) {
    if (model.original === null) {
      dropped.add(model);
    } else {
      model.deleted = !isRestore;
    }
  }
  if (dropped.size > 0) {
    // Row indices shift once inserts are removed, so the selection can't be kept.
    rowModels = rowModels.filter((model) => !dropped.has(model));
    clearRowSelection();
  }
  render();
  renderSelection();
  refreshPending();
}

// Editing a cell of a selected row edits that column in every selected row (Ctrl-picked rows
// included); null when the cell is outside the row selection or the selection is a single row.
function bulkTargetsFor(cell: GridCell): GridCell[] | null {
  if (selectedRows.size < 2 || !selectedRows.has(cell.r)) {
    return null;
  }
  return [...selectedRows].sort((a, b) => a - b).map((r) => ({ r, c: cell.c }));
}

function rectCells(rect: { r1: number; r2: number; c1: number; c2: number }): GridCell[] {
  const cells: GridCell[] = [];
  for (let r = rect.r1; r <= rect.r2; r += 1) {
    for (let c = rect.c1; c <= rect.c2; c += 1) {
      cells.push({ r, c });
    }
  }
  return cells;
}

// Copy the selected rows as new pending inserts (auto-increment keys cleared so the DB assigns them).
// Rows selected from the gutter (possibly non-contiguous) or the rows of the cell rectangle.
function duplicateSelectedRows(above: boolean): void {
  const rect = selRect();
  const sources = selectedRows.size > 0 ? sortedSelectedRows() : rect ? rowIndexes(rect.r1, rect.r2) : [];
  if (sources.length === 0 || !hasPrimaryKey) {
    return;
  }
  pushUndo();
  const copies: RowModel[] = [];
  for (const r of sources) {
    const source = rowModels[r];
    if (!source) {
      continue;
    }
    const values = { ...source.values };
    for (const column of columns) {
      if (column.isAutoIncrement) {
        values[column.name] = null;
      }
    }
    copies.push({ values, original: null, deleted: false });
  }
  if (copies.length === 0) {
    return;
  }
  // The copies land as one block above the first source or below the last one.
  const insertAt = above ? sources[0] : sources[sources.length - 1] + 1;
  rowModels.splice(insertAt, 0, ...copies);
  render();
  if (selectedRows.size > 0) {
    // Keep working on the copies: they become the row selection.
    selectedRows = rowRange(insertAt, insertAt + copies.length - 1);
    rowAnchor = insertAt;
    rowFocus = insertAt + copies.length - 1;
  } else if (rect) {
    selAnchor = { r: insertAt, c: rect.c1 };
    selFocus = { r: insertAt + copies.length - 1, c: rect.c2 };
  }
  renderSelection();
  refreshPending();
}

// Fill every editable cell of `cells` with `raw`, then re-render keeping the selection.
function applyBulkEdit(cells: GridCell[], raw: string): void {
  for (const { r, c } of cells) {
    const model = rowModels[r];
    const column = renderColumns[c];
    if (model && column && isCellEditable(model, column)) {
      setCellValue(model, column, raw);
    }
  }
  render();
  renderSelection();
  refreshPending();
}

// Live mirror of the lead cell's value into every editable cell of `cells` while typing.
// Updates each cell's model, its display input and null/dirty state without a full re-render
// (which would drop focus). The blur handler still normalizes via applyBulkEdit.
function propagateBulkLive(cells: GridCell[], raw: string): void {
  for (const { r, c } of cells) {
    const model = rowModels[r];
    const column = renderColumns[c];
    if (!model || !column || !isCellEditable(model, column) || !isPlainTextColumn(column.type)) {
      continue;
    }
    setCellValue(model, column, raw);
    const cell = grid.querySelector<HTMLTableCellElement>(`td[data-r="${r}"][data-c="${c}"]`);
    const input = cell?.querySelector('input');
    if (input instanceof HTMLInputElement && input !== document.activeElement) {
      input.value = raw;
      input.classList.toggle('null', model.values[column.name] === null);
    }
    if (cell) {
      applyCellState(cell, model, column);
    }
  }
}

function isCellEditable(model: RowModel, column: ColumnMeta): boolean {
  const isGenerated = column.isAutoIncrement && model.original === null;
  return hasPrimaryKey && !isGenerated;
}

function setCellValue(model: RowModel, column: ColumnMeta, raw: string): void {
  model.values[column.name] = raw === '' && column.isNullable ? null : raw;
}

function cellInputAt(r: number, c: number): HTMLInputElement | null {
  const td = grid.querySelector<HTMLTableCellElement>(`td[data-r="${r}"][data-c="${c}"]`);
  const input = td?.querySelector('input');
  return input instanceof HTMLInputElement ? input : null;
}

// A checklist of every column; unchecking one hides it from the grid (session-only).
function buildColMenu(): void {
  colMenu.replaceChildren();

  // Bulk toggles pinned at the top — deselect all is the quick path to showing just one or two columns.
  const setAll = (visible: boolean): void => {
    for (const column of columns) {
      if (visible) {
        hiddenColumns.delete(column.name);
      } else {
        hiddenColumns.add(column.name);
      }
    }
    for (const box of colMenu.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) {
      box.checked = visible;
    }
    render();
  };
  const tools = document.createElement('div');
  tools.className = 'col-menu-tools';
  const selectAll = document.createElement('button');
  selectAll.className = 'btn btn-sm btn-ghost';
  selectAll.textContent = 'Select all';
  selectAll.addEventListener('click', () => setAll(true));
  const deselectAll = document.createElement('button');
  deselectAll.className = 'btn btn-sm btn-ghost';
  deselectAll.textContent = 'Deselect all';
  deselectAll.addEventListener('click', () => setAll(false));
  tools.append(selectAll, deselectAll);
  colMenu.appendChild(tools);

  for (const column of columns) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !hiddenColumns.has(column.name);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        hiddenColumns.delete(column.name);
      } else {
        hiddenColumns.add(column.name);
      }
      render();
    });
    const name = document.createElement('span');
    name.className = 'col-menu-name';
    name.textContent = column.name;
    const type = document.createElement('span');
    type.className = 'col-menu-type';
    type.textContent = column.type;
    label.append(checkbox, name, type);
    colMenu.appendChild(label);
  }
}

// Arrow-key navigation between the column checkboxes; Escape closes and returns focus to the toggle.
function onColMenuKeydown(event: KeyboardEvent): void {
  const boxes = [...colMenu.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
  const current = boxes.indexOf(document.activeElement as HTMLInputElement);
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
    boxes[(next + boxes.length) % boxes.length]?.focus();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    colMenu.hidden = true;
    colMenuToggle.focus();
  }
}

// Snapshot the current grid state before a structural edit, so Ctrl+Z can restore it.
function pushUndo(): void {
  undoStack.push(cloneModels(rowModels));
  if (undoStack.length > UNDO_LIMIT) {
    undoStack.shift();
  }
  redoStack = [];
}

function undo(): void {
  const previous = undoStack.pop();
  if (!previous) {
    return;
  }
  redoStack.push(cloneModels(rowModels));
  restoreModels(previous);
}

function redo(): void {
  const next = redoStack.pop();
  if (!next) {
    return;
  }
  undoStack.push(cloneModels(rowModels));
  restoreModels(next);
}

function restoreModels(models: RowModel[]): void {
  rowModels = models;
  selAnchor = null;
  selFocus = null;
  clearRowSelection();
  render();
  refreshPending();
}

function selRect(): { r1: number; r2: number; c1: number; c2: number } | null {
  if (!selAnchor || !selFocus) {
    return null;
  }
  return {
    r1: Math.min(selAnchor.r, selFocus.r),
    r2: Math.max(selAnchor.r, selFocus.r),
    c1: Math.min(selAnchor.c, selFocus.c),
    c2: Math.max(selAnchor.c, selFocus.c),
  };
}

function renderSelection(): void {
  const rect = selRect();
  for (const td of grid.querySelectorAll<HTMLTableCellElement>('td[data-r]')) {
    const r = Number(td.dataset.r);
    const c = Number(td.dataset.c);
    td.classList.toggle('sel', rect !== null && r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2);
  }
  for (const tr of grid.querySelectorAll<HTMLTableRowElement>('tbody tr[data-r]')) {
    tr.classList.toggle('row-sel', selectedRows.has(Number(tr.dataset.r)));
  }
}

// Copies whole rows when rows are selected from the gutter, otherwise the cell rectangle.
function copySelection(): void {
  const data = selectionData();
  if (!data) {
    return;
  }
  api.postMessage({ type: 'copy', format: chosenFormat(), columns: data.columns, rows: data.rows });
}

// Export the current selection, or the whole (filtered) result when nothing is selected.
function exportSelection(): void {
  const data = selectionData() ?? rangeData(allRows(), { c1: 0, c2: renderColumns.length - 1 });
  api.postMessage({ type: 'export', format: chosenFormat(), columns: data.columns, rows: data.rows });
}

function selectionData(): { columns: string[]; rows: Array<Array<string | null>> } | null {
  if (selectedRows.size > 0) {
    return rangeData(sortedSelectedRows(), { c1: 0, c2: renderColumns.length - 1 });
  }
  const rect = selRect();
  return rect ? rangeData(rowIndexes(rect.r1, rect.r2), rect) : null;
}

function sortedSelectedRows(): number[] {
  return [...selectedRows].sort((a, b) => a - b);
}

function rowIndexes(from: number, to: number): number[] {
  const rows: number[] = [];
  for (let r = from; r <= to; r += 1) {
    rows.push(r);
  }
  return rows;
}

function allRows(): number[] {
  return rowIndexes(0, rowModels.length - 1);
}

function chosenFormat(): CopyFormat {
  return copyFormatSelect.value as CopyFormat;
}

// Column names and cell values for a rectangle, skipping rows hidden by a local filter.
function rangeData(
  rowsWanted: number[],
  span: { c1: number; c2: number },
): {
  columns: string[];
  rows: Array<Array<string | null>>;
} {
  const columns: string[] = [];
  for (let c = span.c1; c <= span.c2; c += 1) {
    if (renderColumns[c]) {
      columns.push(renderColumns[c].name);
    }
  }
  const rows: Array<Array<string | null>> = [];
  for (const r of rowsWanted) {
    const model = rowModels[r];
    if (model && rowPassesFilters(model)) {
      rows.push(columns.map((name) => model.values[name]));
    }
  }
  return { columns, rows };
}

function fillDown(): void {
  const rect = selRect();
  if (!rect || !hasPrimaryKey) {
    return;
  }
  pushUndo();
  const anchor = selAnchor;
  const focus = selFocus;
  for (let c = rect.c1; c <= rect.c2; c += 1) {
    const name = renderColumns[c].name;
    const topValue = rowModels[rect.r1]?.values[name] ?? null;
    for (let r = rect.r1 + 1; r <= rect.r2; r += 1) {
      const model = rowModels[r];
      if (model) {
        model.values[name] = topValue;
      }
    }
  }
  render();
  selAnchor = anchor;
  selFocus = focus;
  renderSelection();
  refreshPending();
}

async function pasteSelection(): Promise<void> {
  const rect = selRect();
  if (!rect || !hasPrimaryKey) {
    return;
  }
  const text = await navigator.clipboard.readText();
  const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n');
  pushUndo();
  const anchor = selAnchor;
  const focus = selFocus;
  lines.forEach((line, rowOffset) => {
    const model = rowModels[rect.r1 + rowOffset];
    if (!model) {
      return;
    }
    line.split('\t').forEach((cellValue, colOffset) => {
      const column = renderColumns[rect.c1 + colOffset];
      if (column) {
        model.values[column.name] = cellValue === '' && column.isNullable ? null : cellValue;
      }
    });
  });
  render();
  selAnchor = anchor;
  selFocus = focus;
  renderSelection();
  refreshPending();
}
pagerFirst.addEventListener('click', () => goToOffset(0));
pagerPrev.addEventListener('click', () => goToOffset(offset - pageSize));
pagerNext.addEventListener('click', () => goToOffset(offset + pageSize));
pagerLast.addEventListener('click', () => goToOffset(lastOffset()));
pageSizeInput.addEventListener('change', () => {
  api.postMessage({ type: 'page', offset: 0, pageSize: pageSizeInput.value === 'No' ? 0 : parseInt(pageSizeInput.value, 10) });
});

window.addEventListener('message', (event: MessageEvent<ExtensionToWebview>) => {
  const message = event.data;
  if (message.type === 'data') {
    total = message.total;
    offset = message.offset;
    pageSize = message.pageSize;
    dateLocale = message.dateLocale;
    orderBy = message.orderBy;
    namespace = message.namespace;
    foreignKeys = message.foreignKeys;
    incomingForeignKeys = message.incomingForeignKeys;
    indexedColumns = new Set(message.indexedColumns);
    readOnly = message.readOnly;
    filterInput.value = message.filter;
    orderByInput.value = message.orderBy;
    loadData(message.columns, message.pkColumns, message.rows);
    updatePager();
    return;
  }
  if (message.type === 'fkValuesResult') {
    resolveFkValues(message.requestId, message.options, message.hasMore);
    return;
  }
  if (message.type === 'editsPreview') {
    pendingBody.textContent = message.statements.join('\n');
    return;
  }
  if (message.type === 'error') {
    notice.textContent = message.message;
    notice.classList.add('error');
  }
});

api.postMessage({ type: 'ready' });

function goToOffset(next: number): void {
  api.postMessage({ type: 'page', offset: Math.max(0, Math.min(next, lastOffset())), pageSize });
}

function lastOffset(): number {
  return total === 0 || pageSize === 0 ? 0 : Math.floor((total - 1) / pageSize) * pageSize;
}

function updatePager(): void {
  pageSizeInput.value = pageSize === 0 ? 'No' : String(pageSize);
  pagerInfo.textContent = `${total === 0 ? 0 : offset + 1}–${offset + rowModels.length} of ${total}`;
  const atStart = pageSize === 0 || offset === 0;
  const atEnd = pageSize === 0 || offset + pageSize >= total;
  pagerFirst.disabled = atStart;
  pagerPrev.disabled = atStart;
  pagerNext.disabled = atEnd;
  pagerLast.disabled = atEnd;
}

function loadData(nextColumns: ColumnMeta[], nextPkColumns: string[], rows: Row[]): void {
  // Drop remembered widths only when the column set actually changes (a different table/query),
  // so sorting or paging the same table keeps its widths stable.
  const sameColumns =
    nextColumns.length === columns.length && nextColumns.every((column, index) => column.name === columns[index]?.name);
  if (!sameColumns) {
    columnWidths.clear();
  }
  columns = nextColumns;
  columnOrder = nextColumns.map((column) => column.name);
  pkColumns = nextPkColumns;
  // A read-only connection disables all editing, exactly like a table with no primary key.
  hasPrimaryKey = nextPkColumns.length > 0 && !readOnly;
  rowModels = rows.map((row) => ({ values: toCellRow(row), original: toCellRow(row), deleted: false }));
  hiddenColumns.clear();
  columnFilters.clear();
  colMenu.hidden = true;
  undoStack = [];
  redoStack = [];
  clearRowSelection();
  notice.classList.remove('error');
  notice.textContent = readOnly
    ? 'Read-only connection: editing is disabled.'
    : hasPrimaryKey
      ? ''
      : 'Read-only: this table has no primary key, rows cannot be edited safely.';
  render();
  refreshPending();
}

function render(): void {
  renderColumns = columnOrder
    .map((name) => columns.find((column) => column.name === name))
    .filter((column): column is ColumnMeta => column !== undefined && !hiddenColumns.has(column.name));
  colElements = [];
  grid.replaceChildren(buildColgroup(), buildHead(), buildBody(), buildFooter());
  autofitAll(INITIAL_MAX_WIDTH);
  updatePageSearchCount();
}

// A full-width "add row" affordance pinned under the data, Notion/Excel style.
function buildFooter(): HTMLTableSectionElement {
  const foot = document.createElement('tfoot');
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.className = 'add-row';
  cell.colSpan = renderColumns.length + 1;
  cell.textContent = '＋  Add row';
  if (hasPrimaryKey) {
    cell.addEventListener('click', addRow);
  } else {
    cell.classList.add('disabled');
  }
  row.appendChild(cell);
  foot.appendChild(row);
  return foot;
}

function buildColgroup(): HTMLTableColElement {
  const group = document.createElement('colgroup');
  const actionsCol = document.createElement('col');
  // The gutter holds the line number (widened for its digit count) and the delete button on hover.
  const maxLineNumber = offset + rowModels.length;
  const digits = String(Math.max(1, maxLineNumber)).length;
  actionsCol.style.width = `${Math.max(30, digits * 8 + 14)}px`;
  group.appendChild(actionsCol);
  for (const _column of renderColumns) {
    const col = document.createElement('col');
    colElements.push(col);
    group.appendChild(col);
  }
  return group as unknown as HTMLTableColElement;
}

function buildHead(): HTMLTableSectionElement {
  const head = document.createElement('thead');
  const row = document.createElement('tr');
  const gutterHead = document.createElement('th');
  gutterHead.className = 'gutter';
  gutterHead.textContent = '#';
  row.appendChild(gutterHead);
  renderColumns.forEach((column, index) => {
    const cell = document.createElement('th');
    // Hover reveals the column's SQL type (PHPStorm-style).
    cell.title = `${column.name}  ${column.type}`;
    // Name over its SQL type, so the type reads at a glance without hovering.
    const label = document.createElement('span');
    label.className = 'th-label';
    const name = document.createElement('span');
    name.className = 'th-name';
    name.textContent = column.name;
    const type = document.createElement('span');
    type.className = 'th-type';
    type.textContent = compactType(column.type);
    label.append(name, type);
    // Clicking the name selects the whole column (then typing bulk-edits it).
    label.addEventListener('click', () => selectColumn(index));
    // Dragging the name reorders the column.
    label.draggable = true;
    label.addEventListener('dragstart', (event) => {
      dragColumn = column.name;
      event.dataTransfer?.setData('text/plain', column.name);
    });
    label.addEventListener('dragend', () => {
      dragColumn = null;
      clearDropMarkers();
    });
    // Flex layout lives on an inner wrapper so the <th> stays a real table cell.
    const inner = document.createElement('div');
    inner.className = 'th-inner';
    inner.appendChild(label);
    if (column.isPrimaryKey) {
      const key = document.createElement('span');
      key.className = 'pk-key';
      key.textContent = '🔑';
      inner.appendChild(key);
    }
    const badge = buildColumnBadge(column);
    if (badge) {
      inner.appendChild(badge);
    }
    inner.appendChild(buildFilterButton(column));
    inner.appendChild(buildSortButton(column.name));
    cell.appendChild(inner);
    if (column.isPrimaryKey) {
      cell.classList.add('pk');
    }
    cell.appendChild(buildResizer(index));
    bindColumnDrop(cell, column.name);
    row.appendChild(cell);
  });
  head.appendChild(row);
  return head;
}

// One badge per column at most: foreign key wins over a plain index (it's the more useful signal).
// Primary keys already show the 🔑 and are skipped here.
function buildColumnBadge(column: ColumnMeta): HTMLSpanElement | null {
  const isForeignKey = foreignKeyFor(column.name) !== undefined;
  const isIndexed = indexedColumns.has(column.name) && !column.isPrimaryKey;
  if (!isForeignKey && !isIndexed) {
    return null;
  }
  const badge = document.createElement('span');
  badge.className = isForeignKey ? 'col-badge fk-badge' : 'col-badge index-badge';
  badge.innerHTML = isForeignKey ? FK_SVG : INDEX_SVG;
  badge.title = isForeignKey ? 'Foreign key' : 'Indexed';
  return badge;
}

// A 3-state sort toggle at the right of each header: none (⇕) → ASC (▲) → DESC (▼) → none.
function buildSortButton(column: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'sort-btn';
  const current = parseOrder(orderBy);
  const isSorted = current !== null && current.column === column;
  button.textContent = isSorted ? (current!.direction === 'ASC' ? '▲' : '▼') : '⇕';
  button.classList.toggle('active', isSorted);
  button.title = 'Sort ascending / descending / none';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    cycleSort(column);
  });
  return button;
}

// Parse a single-column `col ASC|DESC` clause so the header arrow can reflect it (null if multi-column/custom).
// Funnel toggle that opens the column's local filter popup (Excel-style value picker).
function buildFilterButton(column: ColumnMeta): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'filter-btn';
  button.innerHTML = FUNNEL_SVG;
  button.classList.toggle('active', columnFilters.has(column.name));
  button.title = 'Local filter';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    openFilterPopup(column, button);
  });
  return button;
}

// Distinct values of a column among loaded rows, with counts, checkable to narrow the view.
function openFilterPopup(column: ColumnMeta, anchor: HTMLElement): void {
  const counts = new Map<CellValue, number>();
  for (const model of rowModels) {
    const value = model.values[column.name];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => displayValue(a[0]).localeCompare(displayValue(b[0])));
  const active = columnFilters.get(column.name);

  filterPop.replaceChildren();
  const title = document.createElement('div');
  title.className = 'filter-pop-title';
  title.textContent = `Local Filter For '${column.name}'`;
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'filter-pop-search';
  search.placeholder = 'Search…';
  const list = document.createElement('div');
  list.className = 'filter-pop-list';

  // Set by the footer once its button exists; keeps "Remove filter" enabled only when a filter is set.
  let syncRemoveState = (): void => {};
  const apply = (): void => {
    const checked = [...list.querySelectorAll<HTMLInputElement>('input:checked')];
    if (checked.length === entries.length) {
      columnFilters.delete(column.name); // all values kept → no filter
    } else {
      columnFilters.set(column.name, new Set(checked.map((box) => decodeValue(box.value))));
    }
    syncRemoveState();
    render();
  };

  for (const [value, count] of entries) {
    const row = document.createElement('label');
    row.className = 'filter-pop-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = encodeValue(value);
    box.checked = !active || active.has(value);
    box.addEventListener('change', apply);
    const label = document.createElement('span');
    label.className = 'filter-pop-value';
    label.textContent = displayValue(value);
    const badge = document.createElement('span');
    badge.className = 'filter-pop-count';
    badge.textContent = String(count);
    row.append(box, label, badge);
    list.appendChild(row);
  }

  search.addEventListener('input', () => {
    const needle = search.value.toLowerCase();
    for (const row of list.querySelectorAll<HTMLLabelElement>('.filter-pop-row')) {
      const text = row.querySelector('.filter-pop-value')?.textContent ?? '';
      row.hidden = !text.toLowerCase().includes(needle);
    }
  });

  // Check/uncheck every currently-visible value (respects the search box), then re-apply.
  const setAllVisible = (checked: boolean): void => {
    for (const row of list.querySelectorAll<HTMLLabelElement>('.filter-pop-row')) {
      if (!row.hidden) {
        const box = row.querySelector<HTMLInputElement>('input');
        if (box) {
          box.checked = checked;
        }
      }
    }
    apply();
  };

  // Bulk toggles — deselect all is the quick path to "keep just one or two values".
  const bulk = document.createElement('div');
  bulk.className = 'filter-pop-bulk';
  const selectAll = document.createElement('button');
  selectAll.className = 'btn btn-sm btn-ghost';
  selectAll.textContent = 'Select all';
  selectAll.addEventListener('click', () => setAllVisible(true));
  const deselectAll = document.createElement('button');
  deselectAll.className = 'btn btn-sm btn-ghost';
  deselectAll.textContent = 'Deselect all';
  deselectAll.addEventListener('click', () => setAllVisible(false));
  bulk.append(selectAll, deselectAll);

  const footer = document.createElement('div');
  footer.className = 'filter-pop-footer';
  const remove = document.createElement('button');
  remove.className = 'btn btn-sm btn-danger btn-block';
  remove.textContent = 'Remove filter';
  syncRemoveState = (): void => {
    remove.disabled = !columnFilters.has(column.name);
  };
  syncRemoveState();
  remove.addEventListener('click', () => {
    columnFilters.delete(column.name);
    filterPop.hidden = true;
    render();
  });
  footer.append(remove);

  filterPop.append(title, search, bulk, list, footer);
  const rect = anchor.getBoundingClientRect();
  filterPop.style.left = `${Math.min(rect.left, window.innerWidth - 280)}px`;
  filterPop.style.top = `${rect.bottom + 2}px`;
  filterPop.hidden = false;
  search.focus();
}

// Select an entire column (all rows); typing then fills every selected cell.
function selectColumn(colIndex: number): void {
  if (rowModels.length === 0) {
    return;
  }
  // Anchor at the bottom, focus (lead) at the top so typing edits the first row.
  clearRowSelection();
  selAnchor = { r: rowModels.length - 1, c: colIndex };
  selFocus = { r: 0, c: colIndex };
  renderSelection();
}

// Let a header accept a dragged column and drop it before/after itself.
function bindColumnDrop(cell: HTMLTableCellElement, targetName: string): void {
  cell.addEventListener('dragover', (event) => {
    if (!dragColumn || dragColumn === targetName) {
      return;
    }
    event.preventDefault();
    const after = isRightHalf(cell, event);
    cell.classList.toggle('drop-after', after);
    cell.classList.toggle('drop-before', !after);
  });
  cell.addEventListener('dragleave', () => cell.classList.remove('drop-before', 'drop-after'));
  cell.addEventListener('drop', (event) => {
    event.preventDefault();
    if (dragColumn) {
      moveColumn(dragColumn, targetName, isRightHalf(cell, event));
    }
    clearDropMarkers();
  });
}

function isRightHalf(cell: HTMLTableCellElement, event: MouseEvent): boolean {
  const rect = cell.getBoundingClientRect();
  return event.clientX > rect.left + rect.width / 2;
}

function clearDropMarkers(): void {
  for (const cell of grid.querySelectorAll('th')) {
    cell.classList.remove('drop-before', 'drop-after');
  }
}

// Reorder columnOrder by moving `sourceName` before or after `targetName`, then re-render.
function moveColumn(sourceName: string, targetName: string, after: boolean): void {
  if (sourceName === targetName) {
    return;
  }
  const from = columnOrder.indexOf(sourceName);
  if (from < 0) {
    return;
  }
  columnOrder.splice(from, 1);
  const target = columnOrder.indexOf(targetName);
  if (target < 0) {
    columnOrder.push(sourceName);
  } else {
    columnOrder.splice(after ? target + 1 : target, 0, sourceName);
  }
  selAnchor = null;
  selFocus = null;
  render();
}

// Cycle a column's server-side sort: none → ASC → DESC → none. Host builds the quoted clause.
function cycleSort(column: string): void {
  const current = parseOrder(orderBy);
  let next = column;
  let direction: 'ASC' | 'DESC' = 'ASC';
  if (current && current.column === column) {
    if (current.direction === 'ASC') {
      direction = 'DESC';
    } else {
      next = '';
    }
  }
  api.postMessage({ type: 'sort', column: next, direction });
}

// Excel-like column sizing: drag the right edge to widen/narrow, double-click to auto-fit.
function buildResizer(index: number): HTMLDivElement {
  const resizer = document.createElement('div');
  resizer.className = 'col-resizer';
  resizer.addEventListener('mousedown', (event) => startResize(event, index));
  resizer.addEventListener('dblclick', (event) => {
    event.preventDefault();
    autofit(index, 1000);
  });
  return resizer;
}

function startResize(event: MouseEvent, index: number): void {
  event.preventDefault();
  const header = (event.target as HTMLElement).parentElement as HTMLElement;
  const startX = event.clientX;
  const startWidth = header.getBoundingClientRect().width;
  document.body.classList.add('resizing');
  // Never let a drag shrink a column past its header label.
  const minWidth = headerMinWidth(renderColumns[index]);
  const onMove = (moveEvent: MouseEvent): void => {
    const width = Math.max(minWidth, startWidth + moveEvent.clientX - startX);
    colElements[index].style.width = `${width}px`;
    // Remember the user's width so reloads (sort/page) keep it instead of re-measuring.
    columnWidths.set(renderColumns[index].name, width);
    syncTableWidth();
  };
  const onUp = (): void => {
    document.body.classList.remove('resizing');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// On (re)render, reuse a column's remembered width if we have one; only measure columns
// seen for the first time. This keeps columns aligned across sorting, paging and filtering.
function autofitAll(maxWidth: number): void {
  updateCellFont();
  renderColumns.forEach((column, index) => {
    const remembered = columnWidths.get(column.name);
    const width = remembered ?? measureColumn(index, maxWidth);
    columnWidths.set(column.name, width);
    colElements[index].style.width = `${width}px`;
  });
  syncTableWidth();
}

// Double-click on the resizer: force a fresh measure and remember it.
function autofit(index: number, maxWidth: number): void {
  const width = measureColumn(index, maxWidth);
  columnWidths.set(renderColumns[index].name, width);
  colElements[index].style.width = `${width}px`;
  syncTableWidth();
}

// Pin the table width to the sum of its columns so widening a column overflows
// (horizontal scroll) instead of squeezing the others.
function syncTableWidth(): void {
  let total = 30; // actions column + border slack
  for (const col of colElements) {
    total += parseFloat(col.style.width) || 0;
  }
  grid.style.width = `${total}px`;
}

// The smallest a column may ever be: its full header label plus the funnel/sort controls and the
// cell padding. Headers must never ellipsize, so this is the floor for both auto-fit and resizing.
function headerMinWidth(column: ColumnMeta): number {
  if (!measureCtx) {
    return MIN_WIDTH;
  }
  measureCtx.font = headerFont;
  const badge = buildColumnBadge(column) ? BADGE_WIDTH : 0;
  const controls = HEADER_CONTROLS + (column.isPrimaryKey ? PK_KEY_WIDTH : 0) + badge;
  return Math.ceil(measureCtx.measureText(column.name).width) + controls + CELL_PADDING;
}

function measureColumn(index: number, maxWidth: number): number {
  if (!measureCtx) {
    return 150;
  }
  const column = renderColumns[index];
  const isDate = isDateColumn(column.type);
  measureCtx.font = cellFont;
  let widestCell = 0;
  for (const model of rowModels) {
    const value = model.values[column.name];
    const text = isDate && value !== null ? formatDate(value, dateLocale) : value ?? 'NULL';
    const width = measureCtx.measureText(text).width;
    if (width > widestCell) {
      widestCell = width;
    }
  }
  // Date columns need room for the native field's calendar/spinner controls in edit mode, so the
  // full date stays visible; datetime (with seconds) needs the most.
  const dateType = dateInputType(column.type);
  const extra = dateType === 'datetime-local' ? 72 : dateType === 'date' ? 44 : 0;
  const contentWidth = Math.ceil(widestCell) + CELL_PADDING + extra;
  // Never below the header label, never above the initial cap.
  return Math.min(maxWidth, Math.max(headerMinWidth(column), contentWidth));
}

function updateCellFont(): void {
  const sample = grid.querySelector('td input') ?? grid.querySelector('th');
  if (sample) {
    const style = getComputedStyle(sample);
    cellFont = style.font && style.font.trim() ? style.font : `${style.fontSize} ${style.fontFamily}`;
  }
  const label = grid.querySelector('.th-name');
  if (label) {
    const style = getComputedStyle(label);
    headerFont = style.font && style.font.trim() ? style.font : `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  }
}

function buildBody(): HTMLTableSectionElement {
  const body = document.createElement('tbody');
  // Local column filters hide rows in the view only; rowIndex stays the absolute model index.
  // lineNumber counts visible rows only and is offset by pagination, so it reads as the DB row position.
  let lineNumber = offset;
  rowModels.forEach((model, rowIndex) => {
    if (rowPassesFilters(model)) {
      lineNumber += 1;
      body.appendChild(buildRow(model, rowIndex, lineNumber));
    }
  });
  return body;
}

function rowPassesFilters(model: RowModel): boolean {
  for (const [name, allowed] of columnFilters) {
    if (!allowed.has(model.values[name])) {
      return false;
    }
  }
  return pageSearch === '' || renderColumns.some((column) => (model.values[column.name] ?? '').toLowerCase().includes(pageSearch));
}

// "n / total" next to the search box while a needle is set; red when nothing matches.
function updatePageSearchCount(): void {
  if (pageSearch === '') {
    pageSearchCount.textContent = '';
    pageSearchCount.className = 'find-count';
    return;
  }
  const matching = rowModels.filter((model) => rowPassesFilters(model)).length;
  pageSearchCount.textContent = `${matching} / ${rowModels.length}`;
  pageSearchCount.className = matching === 0 ? 'find-count none' : 'find-count';
}

function buildRow(model: RowModel, rowIndex: number, lineNumber: number): HTMLTableRowElement {
  const row = document.createElement('tr');
  applyRowState(row, model);
  row.dataset.r = String(rowIndex);
  row.appendChild(buildDeleteCell(model, row, rowIndex, lineNumber));
  renderColumns.forEach((column, colIndex) => {
    const cell = buildCell(model, column);
    cell.dataset.r = String(rowIndex);
    cell.dataset.c = String(colIndex);
    row.appendChild(cell);
  });
  return row;
}

function buildDeleteCell(
  model: RowModel,
  row: HTMLTableRowElement,
  rowIndex: number,
  lineNumber: number,
): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.className = 'actions';
  // The gutter is the row-selection handle (see onGutterMouseDown).
  cell.dataset.row = String(rowIndex);
  const number = document.createElement('span');
  number.className = 'row-num';
  number.textContent = String(lineNumber);
  cell.appendChild(number);
  if (!hasPrimaryKey) {
    return cell;
  }
  // With a PK, hovering the row swaps the number for the delete button (see grid.css).
  cell.classList.add('actions--deletable');
  const button = document.createElement('button');
  button.textContent = '×';
  button.title = 'Delete row';
  button.addEventListener('click', () => {
    // Inside a row selection the × acts on the whole selection.
    if (selectedRows.has(rowIndex)) {
      deleteSelectedRows();
      return;
    }
    pushUndo();
    if (model.original === null) {
      // Uncommitted new row → just drop it, no "marked for deletion" state.
      rowModels = rowModels.filter((candidate) => candidate !== model);
      render();
      refreshPending();
      return;
    }
    model.deleted = !model.deleted;
    applyRowState(row, model);
    refreshPending();
  });
  cell.appendChild(button);
  return cell;
}

function buildCell(model: RowModel, column: ColumnMeta): HTMLTableCellElement {
  const isInserted = model.original === null;
  // The DB fills auto-increment / identity columns itself, so a new row shows <generated>.
  const isGenerated = column.isAutoIncrement && isInserted;
  // Primary keys stay editable: UPDATE matches on the ORIGINAL pk, so changing it is safe here.
  const editable = hasPrimaryKey && !isGenerated;
  const options = editable ? enumValues(column.type) : null;
  if (options) {
    return buildEnumCell(model, column, options);
  }

  const cell = document.createElement('td');
  const input = document.createElement('input');
  // Long values (JSON, TEXT) open the multi-line modal — a single-line input would swallow their
  // newlines and Enter would just commit it.
  const valueEditor = editable ? valueEditorFor(column.type, model.values[column.name]) : null;
  const dateType = editable && !valueEditor ? dateInputType(column.type) : null;
  // Foreign-key columns get a searchable dropdown of referenced values (key + descriptive label).
  const fk = editable && !valueEditor && !dateType ? foreignKeyFor(column.name) : undefined;
  const value = model.values[column.name];
  // Dates display formatted; a double-click swaps to a native date field for editing.
  input.value = dateType ? formatDate(value, dateLocale) : value ?? '';
  // Excel-like: cells are in display mode; a double-click starts editing.
  input.readOnly = true;
  if (isGenerated) {
    input.placeholder = '<generated>';
    input.classList.add('generated');
  } else {
    input.placeholder = value === null ? 'NULL' : '';
    if (value === null) {
      input.classList.add('null');
    }
  }
  input.addEventListener('input', () => {
    model.values[column.name] = dateType ? fromDateInputValue(input.value, column, dateType) : readInput(input, column);
    input.classList.toggle('null', model.values[column.name] === null);
    applyCellState(cell, model, column);
    // Multi-cell selection: mirror the lead cell into every selected cell live, so the whole
    // region visibly edits together instead of only committing on blur.
    if (bulkCells) {
      propagateBulkLive(bulkCells, input.value);
    }
    refreshPending();
  });
  input.addEventListener('focus', () => cell.classList.add('focused'));
  input.addEventListener('blur', () => {
    cell.classList.remove('focused');
    input.readOnly = true;
    if (dateType) {
      // Back to the formatted display.
      input.type = 'text';
      input.value = formatDate(model.values[column.name], dateLocale);
    }
    // Editing started on a multi-cell selection → fill the whole region with the committed value.
    if (bulkCells) {
      const cells = bulkCells;
      bulkCells = null;
      applyBulkEdit(cells, model.values[column.name] ?? '');
    }
  });

  if (valueEditor) {
    input.classList.add('modal-editable');
    input.addEventListener('dblclick', () => editInModal(valueEditor, model, column, input, cell));
  } else if (editable) {
    input.addEventListener('dblclick', () => {
      if (dateType) {
        pushUndo();
        input.type = dateType;
        if (dateType === 'datetime-local') {
          input.step = '1';
        }
        input.value = toDateInputValue(model.values[column.name], dateType);
        input.readOnly = false;
        input.focus();
      } else if (fk) {
        // Anchor to the cell (not the padded input) so the popup lines up with the column's left edge.
        openFkPopup(
          input.value,
          cell,
          (search, onResult) => requestFkValues(fk, column, search, onResult),
          (picked) => {
            input.value = picked;
            input.dispatchEvent(new Event('input'));
          },
        );
      } else {
        // Double-clicking a cell of a selected row edits that column in every selected row.
        bulkCells = bulkTargetsFor({ r: Number(cell.dataset.r), c: Number(cell.dataset.c) });
        beginInlineEdit(input);
      }
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation(); // the grid-level handler would step the selection a second time
        input.blur();
        stepSelectionAfterCommit(event.key === 'Enter' ? { r: 1, c: 0 } : { r: 0, c: event.shiftKey ? -1 : 1 });
      } else if (event.key === 'Escape') {
        if (bulkCells) {
          // A bulk edit was mirrored live into other cells: the undo snapshot taken when the edit
          // started is the only thing that restores them all.
          bulkCells = null;
          input.readOnly = true;
          input.blur();
          undo();
          return;
        }
        model.values[column.name] = value;
        if (!dateType) {
          input.value = value ?? '';
        }
        applyCellState(cell, model, column);
        refreshPending();
        input.blur();
      }
    });
  }
  applyCellState(cell, model, column);
  cell.appendChild(input);
  maybeAddNavButton(cell, model, column);
  return cell;
}

// A column is navigable when it is a foreign key (jump to the referenced row) or is itself
// referenced by a foreign key elsewhere (list the rows pointing here).
function isNavigableColumn(column: ColumnMeta): boolean {
  return foreignKeyFor(column.name) !== undefined || incomingForeignKeys.some((fk) => fk.refColumns.includes(column.name));
}

// A ↗ affordance on FK / referenced cells that opens the navigation menu on a left click.
function maybeAddNavButton(cell: HTMLTableCellElement, model: RowModel, column: ColumnMeta): void {
  if (!isNavigableColumn(column)) {
    return;
  }
  cell.classList.add('has-nav');
  const button = document.createElement('button');
  button.className = 'nav-btn';
  button.textContent = '↗';
  button.title = 'Go to related rows';
  // Don't let the press start a cell selection.
  button.addEventListener('mousedown', (event) => event.stopPropagation());
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const actions = cellNavActions(model, column);
    if (actions.length > 0) {
      showCellMenu(event.clientX, event.clientY, actions);
    }
  });
  cell.appendChild(button);
}

// After committing an inline edit, Enter moves the selection down and Tab sideways.
function stepSelectionAfterCommit(step: GridCell): void {
  const lead = selFocus ?? selAnchor;
  if (!lead) {
    return;
  }
  const next = {
    r: Math.min(rowModels.length - 1, Math.max(0, lead.r + step.r)),
    c: Math.min(renderColumns.length - 1, Math.max(0, lead.c + step.c)),
  };
  selAnchor = next;
  selFocus = next;
  renderSelection();
  scrollCellIntoView(next);
}

function beginInlineEdit(input: HTMLInputElement): void {
  pushUndo();
  input.readOnly = false;
  input.focus();
  // Cursor at the end of the text rather than selecting everything.
  const end = input.value.length;
  input.setSelectionRange(end, end);
}

function buildEnumCell(model: RowModel, column: ColumnMeta, options: string[]): HTMLTableCellElement {
  const cell = document.createElement('td');
  // A select-looking display that opens a custom, searchable dropdown (native <select> can't search).
  const display = document.createElement('button');
  display.type = 'button';
  display.className = 'cell-enum';
  const setDisplay = (): void => {
    const value = model.values[column.name];
    display.textContent = value ?? (column.isNullable ? 'NULL' : '');
    display.classList.toggle('null', value === null);
  };
  setDisplay();
  display.addEventListener('click', () => {
    const choices = options.map((option) => ({ label: option, value: option as CellValue }));
    if (column.isNullable) {
      choices.unshift({ label: 'NULL', value: null });
    }
    openEnumPopup(choices, model.values[column.name], display, (value) => {
      pushUndo();
      model.values[column.name] = value;
      setDisplay();
      applyCellState(cell, model, column);
      refreshPending();
    });
  });
  applyCellState(cell, model, column);
  cell.appendChild(display);
  return cell;
}

// ---- Foreign keys: value dropdown + navigation ----

function foreignKeyFor(columnName: string): ForeignKeyMeta | undefined {
  return foreignKeys.find((fk) => fk.columns.includes(columnName));
}

let fkRequestSeq = 0;
const fkPending = new Map<number, (options: FkOption[], hasMore: boolean) => void>();

// Ask the host for referenced values (key + label), optionally narrowed by a search term.
function requestFkValues(
  fk: ForeignKeyMeta,
  column: ColumnMeta,
  search: string,
  onResult: (options: FkOption[], hasMore: boolean) => void,
): void {
  const index = fk.columns.indexOf(column.name);
  const refColumn = fk.refColumns[index] ?? fk.refColumns[0];
  const requestId = (fkRequestSeq += 1);
  fkPending.set(requestId, onResult);
  api.postMessage({ type: 'fkValues', requestId, refTable: fk.refTable, refColumn, search });
}

function resolveFkValues(requestId: number, options: FkOption[], hasMore: boolean): void {
  const resolve = fkPending.get(requestId);
  if (resolve) {
    resolve(options, hasMore);
    fkPending.delete(requestId);
  }
}

function onGridContextMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  // Right-clicking the gutter targets that row (joining the selection when it is not part of it).
  const gutter = target.closest('td[data-row]') as HTMLTableCellElement | null;
  if (gutter) {
    const r = Number(gutter.dataset.row);
    if (!selectedRows.has(r)) {
      selAnchor = null;
      selFocus = null;
      selectedRows = new Set([r]);
      rowAnchor = r;
      renderSelection();
    }
    const rowAction = rowSelectionAction();
    if (rowAction) {
      event.preventDefault();
      showCellMenu(event.clientX, event.clientY, [rowAction]);
    }
    return;
  }
  const td = target.closest('td[data-r]') as HTMLTableCellElement | null;
  if (!td) {
    return;
  }
  const model = rowModels[Number(td.dataset.r)];
  const column = renderColumns[Number(td.dataset.c)];
  if (!model || !column) {
    return;
  }
  const clicked = { r: Number(td.dataset.r), c: Number(td.dataset.c) };
  const rowAction = selectedRows.has(clicked.r) ? rowSelectionAction() : null;
  const actions: NavAction[] = [
    ...(rowAction ? [rowAction] : []),
    ...cellValueActions(clicked, model, column),
    {
      label: `Apply in WHERE  (${column.name})`,
      icon: MENU_FILTER_SVG,
      run: () => applyColumnToWhere(column, model.values[column.name]),
    },
    ...cellNavActions(model, column),
  ];
  event.preventDefault();
  showCellMenu(event.clientX, event.clientY, actions);
}

// Explicit NULL / empty string, since typing nothing into a nullable cell always means NULL.
// Empty strings only make sense in text-like columns. The action covers the whole selection
// when the clicked cell is part of it.
function cellValueActions(clicked: GridCell, model: RowModel, column: ColumnMeta): NavAction[] {
  if (!isCellEditable(model, column)) {
    return [];
  }
  const targets = valueActionTargets(clicked);
  const count = targets.length;
  const suffix = count > 1 ? `  (${count} cells)` : '';
  const actions: NavAction[] = [];
  if (column.isNullable) {
    actions.push({ label: `Set NULL${suffix}`, icon: MENU_NULL_SVG, run: () => setCellsTo(targets, null) });
  }
  if (isPlainTextColumn(column.type) && !isNumericColumn(column.type)) {
    actions.push({ label: `Set empty string${suffix}`, icon: MENU_EMPTY_SVG, run: () => setCellsTo(targets, '') });
  }
  return actions;
}

// The cells a value action applies to: the row selection's column, the cell rectangle, or the
// clicked cell alone. Only cells of the clicked column count, so one action means one type.
function valueActionTargets(clicked: GridCell): GridCell[] {
  if (selectedRows.has(clicked.r)) {
    return [...selectedRows].sort((a, b) => a - b).map((r) => ({ r, c: clicked.c }));
  }
  const rect = selRect();
  if (rect && clicked.r >= rect.r1 && clicked.r <= rect.r2 && clicked.c >= rect.c1 && clicked.c <= rect.c2) {
    return rectCells(rect).filter((cell) => cell.c === clicked.c);
  }
  return [clicked];
}

// Write `value` as-is into every editable target (no empty → NULL coercion here: that is the point).
function setCellsTo(cells: GridCell[], value: CellValue): void {
  cellMenu.hidden = true;
  pushUndo();
  for (const { r, c } of cells) {
    const model = rowModels[r];
    const column = renderColumns[c];
    if (model && column && isCellEditable(model, column)) {
      model.values[column.name] = value;
    }
  }
  render();
  renderSelection();
  refreshPending();
}

// "Delete N rows" (or "Restore" when every selected row is already marked) for the row selection.
function rowSelectionAction(): NavAction | null {
  if (!hasPrimaryKey || selectedRows.size === 0) {
    return null;
  }
  const targets = [...selectedRows].map((r) => rowModels[r]).filter((model): model is RowModel => model !== undefined);
  const isRestore = targets.every((model) => model.deleted);
  const count = targets.length;
  return {
    label: `${isRestore ? 'Restore' : 'Delete'} ${count} row${count > 1 ? 's' : ''}`,
    icon: isRestore ? MENU_RESTORE_SVG : MENU_TRASH_SVG,
    run: () => {
      cellMenu.hidden = true;
      deleteSelectedRows();
    },
  };
}

// Append `col = value` to the WHERE box (AND-joined when a clause is already there), then re-query.
function applyColumnToWhere(column: ColumnMeta, value: CellValue): void {
  cellMenu.hidden = true;
  const condition = value === null ? `${column.name} IS NULL` : `${column.name} = ${whereLiteral(column, value)}`;
  const current = filterInput.value.trim();
  filterInput.value = current ? `${current} AND ${condition}` : condition;
  api.postMessage({ type: 'filter', value: filterInput.value });
}

interface NavAction {
  label: string;
  icon: string;
  run: () => void;
}

// Forward: from an FK value → the referenced row. Reverse: from a referenced (PK) value → the rows pointing here.
function cellNavActions(model: RowModel, column: ColumnMeta): NavAction[] {
  const actions: NavAction[] = [];
  const fk = foreignKeyFor(column.name);
  if (fk && model.values[column.name] !== null) {
    actions.push({
      label: `Go to ${fk.refTable}`,
      icon: MENU_GOTO_SVG,
      run: () => openRelated(namespace, fk.refTable, fk.refColumns, fk.columns.map((name) => model.values[name])),
    });
  }
  for (const incoming of incomingForeignKeys) {
    if (incoming.refColumns.includes(column.name) && model.values[column.name] !== null) {
      actions.push({
        label: `Rows in ${incoming.table} (${incoming.columns.join(', ')})`,
        icon: MENU_ROWS_SVG,
        run: () =>
          openRelated(incoming.namespace, incoming.table, incoming.columns, incoming.refColumns.map((name) => model.values[name])),
      });
    }
  }
  return actions;
}

function openRelated(ns: string, table: string, columns: string[], values: Array<string | null>): void {
  cellMenu.hidden = true;
  api.postMessage({ type: 'openRelated', namespace: ns, table, columns, values });
}

function showCellMenu(x: number, y: number, actions: NavAction[]): void {
  cellMenu.replaceChildren();
  for (const action of actions) {
    const item = document.createElement('button');
    item.className = 'cell-menu-item';
    const glyph = document.createElement('span');
    glyph.className = 'cell-menu-icon';
    glyph.innerHTML = action.icon;
    const text = document.createElement('span');
    text.textContent = action.label;
    item.append(glyph, text);
    item.addEventListener('click', action.run);
    cellMenu.appendChild(item);
  }
  cellMenu.style.left = `${x}px`;
  cellMenu.style.top = `${y}px`;
  cellMenu.hidden = false;
}

// JSON / long text edit in the shared modal; saving writes the value back into this cell.
function editInModal(
  editor: ValueEditor,
  model: RowModel,
  column: ColumnMeta,
  input: HTMLInputElement,
  cell: HTMLTableCellElement,
  seed: string | null = null,
): void {
  openValueModal(editor, column, model.values[column.name], seed, (next) => {
    pushUndo();
    model.values[column.name] = next;
    input.value = next ?? '';
    input.classList.toggle('null', next === null);
    applyCellState(cell, model, column);
    refreshPending();
  });
}

function readInput(input: HTMLInputElement, column: ColumnMeta): CellValue {
  if (input.value === '' && column.isNullable) {
    return null;
  }
  return input.value;
}

function applyRowState(row: HTMLTableRowElement, model: RowModel): void {
  row.classList.toggle('deleted', model.deleted);
  row.classList.toggle('inserted', model.original === null);
}

function applyCellState(cell: HTMLTableCellElement, model: RowModel, column: ColumnMeta): void {
  const isDirty = model.original !== null && model.values[column.name] !== model.original[column.name];
  cell.classList.toggle('dirty', isDirty);
}

function addRow(): void {
  pushUndo();
  const values: Record<string, CellValue> = {};
  for (const column of columns) {
    values[column.name] = defaultForNewRow(column);
  }
  rowModels.push({ values, original: null, deleted: false });
  render();
  refreshPending();
}

function commit(): void {
  const edits = computeEdits(rowModels, columns, pkColumns);
  if (edits.length > 0) {
    api.postMessage({ type: 'commit', edits });
  }
}

function refreshPending(): void {
  const count = computeEdits(rowModels, columns, pkColumns).length;
  const dirty = hasLocalChanges(rowModels, columns);
  commitButton.hidden = count === 0;
  revertButton.hidden = count === 0;
  pendingDrawer.hidden = count === 0;
  pendingTitle.textContent = `Pending changes (${count})`;
  if (count === 0) {
    setPendingExpanded(false);
  } else if (pendingExpanded) {
    requestEditsPreview();
  }
  status.textContent = count === 0 && dirty ? 'unsaved changes' : '';
  undoButton.disabled = undoStack.length === 0;
  redoButton.disabled = redoStack.length === 0;
}

