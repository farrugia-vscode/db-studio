import type { CopyFormat, ExtensionToWebview, FkOption, WebviewToExtension } from '../domain/gridProtocol';
import type { ColumnMeta, ForeignKeyMeta, IncomingForeignKey, Row } from '../domain/types';
import type { EditDto } from '../domain/edits/edit';

interface VsCodeApi {
  postMessage(message: WebviewToExtension): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

type CellValue = string | null;

/** `original === null` marks a row inserted in the grid, not yet persisted. */
interface RowModel {
  values: Record<string, CellValue>;
  original: Record<string, CellValue> | null;
  deleted: boolean;
}

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
// Read-only connection → all editing is disabled (treated like a table with no primary key).
let readOnly = false;
let rowModels: RowModel[] = [];
let hasPrimaryKey = false;
let colElements: HTMLTableColElement[] = [];
let dateLocale = '';

const MIN_WIDTH = 56;
const INITIAL_MAX_WIDTH = 360;
const CELL_PADDING = 34;
// Width the header reserves for its funnel + sort buttons, and extra for the PK key glyph.
const HEADER_CONTROLS = 40;
const PK_KEY_WIDTH = 18;
const measureCtx = document.createElement('canvas').getContext('2d');
let cellFont = '12px monospace';

const grid = element<HTMLTableElement>('grid');
const notice = element<HTMLDivElement>('notice');
const status = element<HTMLSpanElement>('status');
const commitButton = element<HTMLButtonElement>('commit');
const revertButton = element<HTMLButtonElement>('revert');
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
// When editing was started on a multi-cell selection, the committed value fills this whole region.
let bulkRect: { r1: number; r2: number; c1: number; c2: number } | null = null;

// Grid-level undo/redo of structural edits (cell change, add/delete row, fill, paste).
// In-cell text editing keeps the field's own native undo while the input is focused.
const UNDO_LIMIT = 100;
let undoStack: RowModel[][] = [];
let redoStack: RowModel[][] = [];

commitButton.addEventListener('click', commit);
revertButton.addEventListener('click', () => api.postMessage({ type: 'reload' }));
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
  previewTimer = window.setTimeout(() => api.postMessage({ type: 'previewEdits', edits: computeEdits() }), 120);
}
reloadButton.addEventListener('click', () => api.postMessage({ type: 'reload' }));
// The 'search' event fires on Enter and when the native clear (×) is clicked.
filterInput.addEventListener('search', () => api.postMessage({ type: 'filter', value: filterInput.value }));
orderByInput.addEventListener('search', () => api.postMessage({ type: 'order', orderBy: orderByInput.value }));
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
// Floating searchable dropdown for ENUM cell editing.
const enumPop = document.createElement('div');
enumPop.className = 'enum-pop';
enumPop.hidden = true;
document.body.appendChild(enumPop);
// Floating searchable dropdown for foreign-key cell editing (key + descriptive label).
const fkPop = document.createElement('div');
fkPop.className = 'enum-pop fk-pop';
fkPop.hidden = true;
document.body.appendChild(fkPop);

// The cell each dropdown is anchored to, so it can follow the cell when the grid scrolls.
let enumAnchor: HTMLElement | null = null;
let fkAnchor: HTMLElement | null = null;

// Keep an open dropdown glued under its cell while the grid scrolls; hide it once the cell scrolls
// out of view (a fixed-position popup would otherwise drift over unrelated columns).
function trackPopup(pop: HTMLElement, anchor: HTMLElement | null): void {
  if (pop.hidden || !anchor) {
    return;
  }
  const rect = anchor.getBoundingClientRect();
  const visible = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  if (visible) {
    positionPopupUnder(pop, rect);
  } else {
    pop.hidden = true;
  }
}
document.addEventListener(
  'scroll',
  () => {
    trackPopup(enumPop, enumAnchor);
    trackPopup(fkPop, fkAnchor);
  },
  true,
);
document.addEventListener('mousedown', (event) => {
  const target = event.target as Node;
  if (!cellMenu.hidden && !cellMenu.contains(target)) {
    cellMenu.hidden = true;
  }
  if (!filterPop.hidden && !filterPop.contains(target) && !(target instanceof HTMLElement && target.closest('.filter-btn'))) {
    filterPop.hidden = true;
  }
  if (!enumPop.hidden && !enumPop.contains(target) && !(target instanceof HTMLElement && target.closest('.cell-enum'))) {
    enumPop.hidden = true;
  }
  if (!fkPop.hidden && !fkPop.contains(target) && !(target instanceof HTMLElement && target.closest('td'))) {
    fkPop.hidden = true;
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !enumPop.hidden) {
    enumPop.hidden = true;
  }
  if (event.key === 'Escape' && !fkPop.hidden) {
    fkPop.hidden = true;
  }
});

function onGridMouseDown(event: MouseEvent): void {
  const td = (event.target as HTMLElement).closest('td[data-r]') as HTMLTableCellElement | null;
  if (!td) {
    return;
  }
  const cell = { r: Number(td.dataset.r), c: Number(td.dataset.c) };
  if (event.shiftKey && selAnchor) {
    selFocus = cell;
  } else {
    selAnchor = cell;
    selFocus = cell;
  }
  selecting = true;
  renderSelection();
}

function onGridMouseMove(event: MouseEvent): void {
  if (!selecting) {
    return;
  }
  const td = (event.target as HTMLElement).closest('td[data-r]') as HTMLTableCellElement | null;
  if (td) {
    selFocus = { r: Number(td.dataset.r), c: Number(td.dataset.c) };
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
    onGridShortcut(event);
    return;
  }
  if (editing || !selRect()) {
    return;
  }
  // Duplicate the selected row(s) as pending inserts (VS Code's Shift+Alt+↓/↑ "copy line").
  if (event.altKey && event.shiftKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    duplicateSelectedRows(event.key === 'ArrowUp');
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

function onGridShortcut(event: KeyboardEvent): void {
  const key = event.key.toLowerCase();
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
  if (!selRect()) {
    return;
  }
  if (key === 'c') {
    event.preventDefault();
    copySelection();
  } else if (key === 'd') {
    event.preventDefault();
    fillDown();
  } else if (key === 'v') {
    event.preventDefault();
    void pasteSelection();
  }
}

// Start editing the lead cell of the current selection, optionally seeded with a typed character.
// Plain text columns only; dates, JSON and enums keep their double-click / dropdown editors.
function beginSelectionEdit(seed: string | null): void {
  const rect = selRect();
  if (!rect || !hasPrimaryKey) {
    return;
  }
  const lead = selFocus ?? selAnchor!;
  const column = renderColumns[lead.c];
  const model = rowModels[lead.r];
  if (!model || !isCellEditable(model, column) || !isPlainTextColumn(column)) {
    return;
  }
  const input = cellInputAt(lead.r, lead.c);
  if (!input) {
    return;
  }
  bulkRect = rect.r1 !== rect.r2 || rect.c1 !== rect.c2 ? { ...rect } : null;
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
  applyBulkEdit(rect, '');
}

// Copy the selected rows as new pending inserts (auto-increment keys cleared so the DB assigns them).
function duplicateSelectedRows(above: boolean): void {
  const rect = selRect();
  if (!rect || !hasPrimaryKey) {
    return;
  }
  pushUndo();
  const copies: RowModel[] = [];
  for (let r = rect.r1; r <= rect.r2; r += 1) {
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
  const insertAt = above ? rect.r1 : rect.r2 + 1;
  rowModels.splice(insertAt, 0, ...copies);
  render();
  selAnchor = { r: insertAt, c: rect.c1 };
  selFocus = { r: insertAt + copies.length - 1, c: rect.c2 };
  renderSelection();
  refreshPending();
}

// Fill every editable cell in `rect` with `raw`, then restore the selection.
function applyBulkEdit(rect: { r1: number; r2: number; c1: number; c2: number }, raw: string): void {
  for (let r = rect.r1; r <= rect.r2; r += 1) {
    const model = rowModels[r];
    if (!model) {
      continue;
    }
    for (let c = rect.c1; c <= rect.c2; c += 1) {
      const column = renderColumns[c];
      if (column && isCellEditable(model, column)) {
        setCellValue(model, column, raw);
      }
    }
  }
  render();
  selAnchor = { r: rect.r1, c: rect.c1 };
  selFocus = { r: rect.r2, c: rect.c2 };
  renderSelection();
  refreshPending();
}

function isCellEditable(model: RowModel, column: ColumnMeta): boolean {
  const isGenerated = column.isAutoIncrement && model.original === null;
  return hasPrimaryKey && !isGenerated;
}

function isPlainTextColumn(column: ColumnMeta): boolean {
  const type = column.type.toLowerCase();
  return !isDateColumn(type) && !type.includes('json') && enumValues(column.type) === null;
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

function cloneModels(): RowModel[] {
  return rowModels.map((model) => ({
    values: { ...model.values },
    original: model.original ? { ...model.original } : null,
    deleted: model.deleted,
  }));
}

// Snapshot the current grid state before a structural edit, so Ctrl+Z can restore it.
function pushUndo(): void {
  undoStack.push(cloneModels());
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
  redoStack.push(cloneModels());
  restoreModels(previous);
}

function redo(): void {
  const next = redoStack.pop();
  if (!next) {
    return;
  }
  undoStack.push(cloneModels());
  restoreModels(next);
}

function restoreModels(models: RowModel[]): void {
  rowModels = models;
  selAnchor = null;
  selFocus = null;
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
}

function copySelection(): void {
  const rect = selRect();
  if (!rect) {
    return;
  }
  const data = rangeData(rect);
  api.postMessage({ type: 'copy', format: chosenFormat(), columns: data.columns, rows: data.rows });
}

// Export the current selection, or the whole (filtered) result when nothing is selected.
function exportSelection(): void {
  const rect = selRect() ?? { r1: 0, r2: rowModels.length - 1, c1: 0, c2: renderColumns.length - 1 };
  const data = rangeData(rect);
  api.postMessage({ type: 'export', format: chosenFormat(), columns: data.columns, rows: data.rows });
}

function chosenFormat(): CopyFormat {
  return copyFormatSelect.value as CopyFormat;
}

// Column names and cell values for a rectangle, skipping rows hidden by a local filter.
function rangeData(rect: { r1: number; r2: number; c1: number; c2: number }): {
  columns: string[];
  rows: Array<Array<string | null>>;
} {
  const columns: string[] = [];
  for (let c = rect.c1; c <= rect.c2; c += 1) {
    if (renderColumns[c]) {
      columns.push(renderColumns[c].name);
    }
  }
  const rows: Array<Array<string | null>> = [];
  for (let r = rect.r1; r <= rect.r2; r += 1) {
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

const jsonModal = element<HTMLDivElement>('jsonModal');
const jsonModalText = element<HTMLTextAreaElement>('jsonModalText');
const jsonStatus = element<HTMLSpanElement>('jsonStatus');
const jsonModalSave = element<HTMLButtonElement>('jsonModalSave');
const jsonModalCancel = element<HTMLButtonElement>('jsonModalCancel');
const jsonFormat = element<HTMLButtonElement>('jsonFormat');

let jsonTarget: { model: RowModel; column: ColumnMeta; input: HTMLInputElement; cell: HTMLTableCellElement } | null = null;

jsonModalSave.addEventListener('click', saveJsonModal);
jsonModalCancel.addEventListener('click', closeJsonModal);
jsonFormat.addEventListener('click', formatJsonModal);
jsonModalText.addEventListener('input', validateJsonModal);
// Only Enter is assisted (scaffolding); every other key types literally — nothing else is intercepted.
jsonModalText.addEventListener('keydown', onJsonEnter);

// Pretty-print the JSON, first tidying common slips (trailing commas) so it usually just works.
function formatJsonModal(): void {
  const tidied = jsonModalText.value.replace(/,(\s*[}\]])/g, '$1');
  try {
    jsonModalText.value = JSON.stringify(JSON.parse(tidied), null, 2);
  } catch {
    // Leave the text untouched when it can't be parsed; the status line explains why.
  }
  validateJsonModal();
  jsonModalText.focus();
}

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
  actionsCol.style.width = '28px';
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
  row.appendChild(document.createElement('th'));
  renderColumns.forEach((column, index) => {
    const cell = document.createElement('th');
    // Hover reveals the column's SQL type (PHPStorm-style).
    cell.title = `${column.name}  ${column.type}`;
    const label = document.createElement('span');
    label.className = 'th-label';
    label.textContent = column.name;
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
function parseOrder(clause: string): { column: string; direction: 'ASC' | 'DESC' } | null {
  const match = /^["'`[\]]*([\w$]+)["'`[\]]*\s+(ASC|DESC)$/i.exec(clause.trim());
  if (!match) {
    return null;
  }
  return { column: match[1], direction: match[2].toUpperCase() as 'ASC' | 'DESC' };
}

// Funnel toggle that opens the column's local filter popup (Excel-style value picker).
function buildFilterButton(column: ColumnMeta): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'filter-btn';
  button.textContent = '▽';
  button.classList.toggle('active', columnFilters.has(column.name));
  button.title = 'Local filter';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    openFilterPopup(column, button);
  });
  return button;
}

const NULL_LABEL = '<null>';

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

  const apply = (): void => {
    const checked = [...list.querySelectorAll<HTMLInputElement>('input:checked')];
    if (checked.length === entries.length) {
      columnFilters.delete(column.name); // all values kept → no filter
    } else {
      columnFilters.set(column.name, new Set(checked.map((box) => decodeValue(box.value))));
    }
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

  const clear = document.createElement('button');
  clear.className = 'filter-pop-clear';
  clear.textContent = 'Clear filter';
  clear.addEventListener('click', () => {
    columnFilters.delete(column.name);
    filterPop.hidden = true;
    render();
  });

  filterPop.append(title, search, list, clear);
  const rect = anchor.getBoundingClientRect();
  filterPop.style.left = `${Math.min(rect.left, window.innerWidth - 280)}px`;
  filterPop.style.top = `${rect.bottom + 2}px`;
  filterPop.hidden = false;
  search.focus();
}

// Null needs a sentinel so it survives the checkbox's string value round-trip.
function encodeValue(value: CellValue): string {
  return value === null ? '\0null' : `s${value}`;
}

function decodeValue(encoded: string): CellValue {
  return encoded === '\0null' ? null : encoded.slice(1);
}

function displayValue(value: CellValue): string {
  return value === null ? NULL_LABEL : value;
}

// Select an entire column (all rows); typing then fills every selected cell.
function selectColumn(colIndex: number): void {
  if (rowModels.length === 0) {
    return;
  }
  // Anchor at the bottom, focus (lead) at the top so typing edits the first row.
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
  const onMove = (moveEvent: MouseEvent): void => {
    colElements[index].style.width = `${Math.max(MIN_WIDTH, startWidth + moveEvent.clientX - startX)}px`;
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

function autofitAll(maxWidth: number): void {
  updateCellFont();
  renderColumns.forEach((_column, index) => autofit(index, maxWidth));
}

function autofit(index: number, maxWidth: number): void {
  colElements[index].style.width = `${measureColumn(index, maxWidth)}px`;
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

function measureColumn(index: number, maxWidth: number): number {
  if (!measureCtx) {
    return 150;
  }
  measureCtx.font = cellFont;
  const column = renderColumns[index];
  const isDate = isDateColumn(column.type);
  // The header shows the name plus the funnel + sort buttons (and a key on the PK), so reserve
  // their width — otherwise a column of short values clips its own header (e.g. "type" → "t…").
  const headerControls = HEADER_CONTROLS + (column.isPrimaryKey ? PK_KEY_WIDTH : 0);
  let widest = measureCtx.measureText(column.name).width + headerControls;
  for (const model of rowModels) {
    const value = model.values[column.name];
    const text = isDate && value !== null ? formatDate(value, dateLocale) : value ?? 'NULL';
    const width = measureCtx.measureText(text).width;
    if (width > widest) {
      widest = width;
    }
  }
  // Date columns need room for the native field's calendar/spinner controls in edit mode, so the
  // full date stays visible; datetime (with seconds) needs the most.
  const dateType = dateInputType(column.type);
  const extra = dateType === 'datetime-local' ? 72 : dateType === 'date' ? 44 : 0;
  return Math.min(maxWidth, Math.max(MIN_WIDTH, Math.ceil(widest) + CELL_PADDING + extra));
}

function updateCellFont(): void {
  const sample = grid.querySelector('td input') ?? grid.querySelector('th');
  if (!sample) {
    return;
  }
  const style = getComputedStyle(sample);
  cellFont = style.font && style.font.trim() ? style.font : `${style.fontSize} ${style.fontFamily}`;
}

function buildBody(): HTMLTableSectionElement {
  const body = document.createElement('tbody');
  // Local column filters hide rows in the view only; rowIndex stays the absolute model index.
  rowModels.forEach((model, rowIndex) => {
    if (rowPassesFilters(model)) {
      body.appendChild(buildRow(model, rowIndex));
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
  return true;
}

function buildRow(model: RowModel, rowIndex: number): HTMLTableRowElement {
  const row = document.createElement('tr');
  applyRowState(row, model);
  row.appendChild(buildDeleteCell(model, row));
  renderColumns.forEach((column, colIndex) => {
    const cell = buildCell(model, column);
    cell.dataset.r = String(rowIndex);
    cell.dataset.c = String(colIndex);
    row.appendChild(cell);
  });
  return row;
}

function buildDeleteCell(model: RowModel, row: HTMLTableRowElement): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.className = 'actions';
  if (!hasPrimaryKey) {
    return cell;
  }
  const button = document.createElement('button');
  button.textContent = '×';
  button.title = 'Delete row';
  button.addEventListener('click', () => {
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
  // Route to the multi-line JSON editor for real JSON columns AND for text columns whose value
  // looks like JSON (object/array) — otherwise Enter would just commit the single-line input.
  const isJson = editable && (column.type.toLowerCase().includes('json') || looksLikeJson(model.values[column.name]));
  const dateType = editable && !isJson ? dateInputType(column.type) : null;
  // Foreign-key columns get a searchable dropdown of referenced values (key + descriptive label).
  const fk = editable && !isJson && !dateType ? foreignKeyFor(column.name) : undefined;
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
    model.values[column.name] = dateType ? fromDateInputValue(input, column, dateType) : readInput(input, column);
    input.classList.toggle('null', model.values[column.name] === null);
    applyCellState(cell, model, column);
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
    if (bulkRect) {
      const rect = bulkRect;
      bulkRect = null;
      applyBulkEdit(rect, model.values[column.name] ?? '');
    }
  });

  if (isJson) {
    input.classList.add('json');
    input.addEventListener('dblclick', () => openJsonModal(model, column, input, cell));
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
        openFkPopup(fk, column, input);
      } else {
        beginInlineEdit(input);
      }
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        input.blur();
      } else if (event.key === 'Escape') {
        bulkRect = null; // cancel any pending bulk fill
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

function beginInlineEdit(input: HTMLInputElement): void {
  pushUndo();
  input.readOnly = false;
  input.focus();
  // Cursor at the end of the text rather than selecting everything.
  const end = input.value.length;
  input.setSelectionRange(end, end);
}

function isDateColumn(type: string): boolean {
  const normalized = type.toLowerCase();
  return normalized === 'date' || normalized.includes('timestamp') || normalized.includes('datetime');
}

function dateInputType(type: string): 'date' | 'datetime-local' | null {
  if (!isDateColumn(type)) {
    return null;
  }
  return type.toLowerCase() === 'date' ? 'date' : 'datetime-local';
}

// Raw 'YYYY-MM-DD[ HH:MM:SS]' → the value a <input type=date|datetime-local> expects.
function toDateInputValue(value: CellValue, dateType: 'date' | 'datetime-local'): string {
  if (value === null) {
    return '';
  }
  if (dateType === 'date') {
    return value.slice(0, 10);
  }
  return value.replace('T', ' ').slice(0, 19).replace(' ', 'T');
}

// Native date field value → the raw 'YYYY-MM-DD[ HH:MM:SS]' stored for the UPDATE.
function fromDateInputValue(input: HTMLInputElement, column: ColumnMeta, dateType: 'date' | 'datetime-local'): CellValue {
  if (input.value === '') {
    return column.isNullable ? null : '';
  }
  return dateType === 'date' ? input.value : input.value.replace('T', ' ');
}

// Display a raw 'YYYY-MM-DD[ HH:MM:SS]' value using the configured locale (empty = raw ISO).
function formatDate(value: CellValue, locale: string): string {
  if (value === null) {
    return '';
  }
  if (!locale) {
    return value;
  }
  const hasTime = value.length > 10;
  const parsed = new Date(hasTime ? value.replace(' ', 'T') : `${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return hasTime ? parsed.toLocaleString(locale) : parsed.toLocaleDateString(locale);
}

// Parses `enum('a','b','c')` (MySQL) into its allowed values, or null if not an enum.
function enumValues(type: string): string[] | null {
  const match = /^enum\((.*)\)$/i.exec(type.trim());
  if (!match) {
    return null;
  }
  return match[1].split(',').map((part) => part.trim().replace(/^'(.*)'$/, '$1').replace(/''/g, "'"));
}

// A value stored in a text column but shaped like JSON (object/array) deserves the JSON editor.
function looksLikeJson(value: CellValue): boolean {
  return value !== null && /^\s*[[{]/.test(value);
}

// Beyond this many options, the enum dropdown shows only the first N and reveals a search box.
const ENUM_SEARCH_THRESHOLD = 10;

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
    openEnumPopup(model, column, options, display, () => {
      setDisplay();
      applyCellState(cell, model, column);
    });
  });
  applyCellState(cell, model, column);
  cell.appendChild(display);
  return cell;
}

// Searchable value picker for an enum cell: first N values always shown; a search box appears
// (and scans every value) once the list is long enough to be awkward to scan.
function openEnumPopup(
  model: RowModel,
  column: ColumnMeta,
  options: string[],
  anchor: HTMLElement,
  onChange: () => void,
): void {
  const current = model.values[column.name];
  const choices: Array<{ label: string; value: CellValue }> = options.map((option) => ({ label: option, value: option }));
  if (column.isNullable) {
    choices.unshift({ label: 'NULL', value: null });
  }
  const hasSearch = choices.length > ENUM_SEARCH_THRESHOLD;

  enumPop.replaceChildren();
  const list = document.createElement('div');
  list.className = 'enum-pop-list';

  const pick = (value: CellValue): void => {
    pushUndo();
    model.values[column.name] = value;
    enumPop.hidden = true;
    onChange();
    refreshPending();
  };

  const renderList = (needle: string): void => {
    list.replaceChildren();
    const filter = needle.trim().toLowerCase();
    const matches = filter
      ? choices.filter((choice) => choice.label.toLowerCase().includes(filter))
      : choices.slice(0, ENUM_SEARCH_THRESHOLD);
    for (const choice of matches) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'enum-pop-row';
      row.classList.toggle('selected', choice.value === current);
      row.classList.toggle('null', choice.value === null);
      row.textContent = choice.label;
      row.addEventListener('click', () => pick(choice.value));
      list.appendChild(row);
    }
    // Signal that more values exist below the first N (only when not searching).
    const hidden = choices.length - matches.length;
    if (!filter && hidden > 0) {
      const more = document.createElement('div');
      more.className = 'enum-pop-more';
      more.textContent = `+${hidden} more — type to search`;
      list.appendChild(more);
    }
  };

  let search: HTMLInputElement | null = null;
  if (hasSearch) {
    search = document.createElement('input');
    search.type = 'search';
    search.className = 'enum-pop-search';
    search.placeholder = 'Search…';
    search.addEventListener('input', () => renderList(search!.value));
    // Enter picks the first match; ArrowDown jumps into the list.
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        list.querySelector<HTMLButtonElement>('.enum-pop-row')?.click();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        list.querySelector<HTMLButtonElement>('.enum-pop-row')?.focus();
      }
    });
    enumPop.appendChild(search);
  }
  enumPop.appendChild(list);
  renderList('');

  enumAnchor = anchor;
  const rect = anchor.getBoundingClientRect();
  enumPop.style.minWidth = `${rect.width}px`;
  enumPop.hidden = false;
  positionPopupUnder(enumPop, rect);
  if (search) {
    search.focus();
  }
}

// Place a floating popup directly under `rect`, measuring it so it never runs off the right edge
// (shift left) or bottom (flip above). The popup must already be visible to be measurable.
function positionPopupUnder(pop: HTMLElement, rect: DOMRect): void {
  const margin = 8;
  let left = rect.left;
  if (left + pop.offsetWidth > window.innerWidth - margin) {
    left = window.innerWidth - pop.offsetWidth - margin;
  }
  left = Math.max(margin, left);
  let top = rect.bottom + 2;
  if (top + pop.offsetHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - pop.offsetHeight - 2);
  }
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
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

// Searchable foreign-key picker: each row shows the referenced key plus a descriptive label
// (name/code/label/…). Search runs server-side; picking writes the key into the cell.
function openFkPopup(fk: ForeignKeyMeta, column: ColumnMeta, input: HTMLInputElement): void {
  const current = input.value;
  fkPop.replaceChildren();
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'enum-pop-search';
  search.placeholder = 'Search…';
  const list = document.createElement('div');
  list.className = 'enum-pop-list';
  fkPop.append(search, list);

  const pick = (value: string): void => {
    fkPop.hidden = true;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  const renderRows = (options: FkOption[], hasMore: boolean): void => {
    list.replaceChildren();
    const count = document.createElement('div');
    count.className = 'enum-pop-more';
    count.textContent = options.length === 0 ? 'No matching rows' : `${options.length}${hasMore ? '+' : ''} result${options.length > 1 ? 's' : ''}`;
    list.appendChild(count);
    for (const option of options) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'enum-pop-row';
      row.classList.toggle('selected', option.value === current);
      // Same single-line rendering as the enum picker (which renders reliably): label · key.
      row.textContent = option.label !== null ? `${option.label}   ·   ${option.value}` : option.value;
      row.title = option.label !== null ? `${option.label} — ${option.value}` : option.value;
      row.addEventListener('click', () => pick(option.value));
      list.appendChild(row);
    }
    if (hasMore) {
      const more = document.createElement('div');
      more.className = 'enum-pop-more';
      more.textContent = 'Refine your search to narrow further';
      list.appendChild(more);
    }
  };

  // Debounce so typing doesn't fire a query per keystroke; the latest request wins.
  let debounce = 0;
  let latest = 0;
  const load = (term: string): void => {
    const seq = (latest += 1);
    requestFkValues(fk, column, term, (options, hasMore) => {
      if (seq === latest) {
        renderRows(options, hasMore);
      }
    });
  };
  search.addEventListener('input', () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => load(search.value), 150);
  });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      list.querySelector<HTMLButtonElement>('.enum-pop-row')?.click();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      list.querySelector<HTMLButtonElement>('.enum-pop-row')?.focus();
    }
  });

  // Anchor to the cell (not the padded input) so the popup lines up with the column's left edge.
  fkAnchor = input.closest('td') ?? input;
  const rect = fkAnchor.getBoundingClientRect();
  fkPop.style.minWidth = `${rect.width}px`;
  fkPop.hidden = false;
  // Show a placeholder immediately so the dropdown never looks empty while the query runs.
  const loading = document.createElement('div');
  loading.className = 'enum-pop-more';
  loading.textContent = 'Loading…';
  list.appendChild(loading);
  positionPopupUnder(fkPop, rect);
  load('');
  search.focus();
}

function onGridContextMenu(event: MouseEvent): void {
  const td = (event.target as HTMLElement).closest('td[data-r]') as HTMLTableCellElement | null;
  if (!td) {
    return;
  }
  const model = rowModels[Number(td.dataset.r)];
  const column = renderColumns[Number(td.dataset.c)];
  if (!model || !column) {
    return;
  }
  const actions = cellNavActions(model, column);
  if (actions.length === 0) {
    return;
  }
  event.preventDefault();
  showCellMenu(event.clientX, event.clientY, actions);
}

interface NavAction {
  label: string;
  run: () => void;
}

// Forward: from an FK value → the referenced row. Reverse: from a referenced (PK) value → the rows pointing here.
function cellNavActions(model: RowModel, column: ColumnMeta): NavAction[] {
  const actions: NavAction[] = [];
  const fk = foreignKeyFor(column.name);
  if (fk && model.values[column.name] !== null) {
    actions.push({
      label: `Go to ${fk.refTable}`,
      run: () => openRelated(namespace, fk.refTable, fk.refColumns, fk.columns.map((name) => model.values[name])),
    });
  }
  for (const incoming of incomingForeignKeys) {
    if (incoming.refColumns.includes(column.name) && model.values[column.name] !== null) {
      actions.push({
        label: `Rows in ${incoming.table} (${incoming.columns.join(', ')})`,
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
    item.textContent = action.label;
    item.addEventListener('click', action.run);
    cellMenu.appendChild(item);
  }
  cellMenu.style.left = `${x}px`;
  cellMenu.style.top = `${y}px`;
  cellMenu.hidden = false;
}

function openJsonModal(
  model: RowModel,
  column: ColumnMeta,
  input: HTMLInputElement,
  cell: HTMLTableCellElement,
): void {
  jsonTarget = { model, column, input, cell };
  jsonModalText.value = prettyJson(model.values[column.name]);
  jsonModal.hidden = false;
  validateJsonModal();
  jsonModalText.focus();
}

function prettyJson(value: string | null): string {
  if (value === null) {
    return '';
  }
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

// Live validity: colors the status and disables Save on invalid JSON (typing stays free — only
// the Save button is gated, never the textarea).
function validateJsonModal(): boolean {
  const text = jsonModalText.value.trim();
  if (text === '') {
    jsonStatus.textContent = 'empty → NULL';
    jsonStatus.className = 'json-status';
    jsonModalSave.disabled = false;
    return true;
  }
  try {
    JSON.parse(text);
    jsonStatus.textContent = '● Valid JSON';
    jsonStatus.className = 'json-status ok';
    jsonModalSave.disabled = false;
    return true;
  } catch (error) {
    jsonStatus.textContent = `● ${(error as Error).message}`;
    jsonStatus.className = 'json-status error';
    jsonModalSave.disabled = true;
    return false;
  }
}

function onJsonEnter(event: KeyboardEvent): void {
  if (event.key !== 'Enter') {
    return;
  }
  event.preventDefault();
  smartJsonEnter();
}

// The bracket enclosing `pos` ('{' object, '[' array, null at top level), ignoring string contents.
function enclosingBracket(value: string, pos: number): '{' | '[' | null {
  const stack: Array<'{' | '['> = [];
  let inString = false;
  for (let i = 0; i < pos; i += 1) {
    const char = value[i];
    if (inString) {
      if (char === '\\') {
        i += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{' || char === '[') {
      stack.push(char);
    } else if (char === '}' || char === ']') {
      stack.pop();
    }
  }
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

// Enter assistance: opening a { or [ drops its closer on the line below and puts the caret inside
// (between "" for an object); otherwise a separating comma is added and, inside an object, the next
// key is scaffolded. Only Enter is remapped — typing is never blocked.
function smartJsonEnter(): void {
  const value = jsonModalText.value;
  const start = jsonModalText.selectionStart;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const indent = /^[ \t]*/.exec(value.slice(lineStart, start))?.[0] ?? '';
  const innerIndent = `${indent}  `;
  const prev = value[start - 1];
  const closerAfter = value[start] === '}' || value[start] === ']';

  if (prev === '{' || prev === '[') {
    const isObject = prev === '{';
    const keyPart = isObject ? '"": ' : '';
    // Move an existing closer to its own line, or add the matching one when it's missing.
    const tail = closerAfter ? `\n${indent}` : `\n${indent}${isObject ? '}' : ']'}`;
    replaceJsonSelection(`\n${innerIndent}${keyPart}${tail}`, start + 1 + innerIndent.length + (isObject ? 1 : 0));
    return;
  }

  const lineBefore = value.slice(lineStart, start).trimEnd();
  const needsComma = lineBefore !== '' && !',:{[('.includes(lineBefore.slice(-1));
  const comma = needsComma ? ',' : '';
  if (enclosingBracket(value, start) === '{') {
    replaceJsonSelection(`${comma}\n${indent}"": `, start + comma.length + 1 + indent.length + 1);
    return;
  }
  const insert = `${comma}\n${indent}`;
  replaceJsonSelection(insert, start + insert.length);
}

function replaceJsonSelection(text: string, caret: number): void {
  const value = jsonModalText.value;
  jsonModalText.value = value.slice(0, jsonModalText.selectionStart) + text + value.slice(jsonModalText.selectionEnd);
  jsonModalText.selectionStart = jsonModalText.selectionEnd = caret;
  validateJsonModal();
}

function saveJsonModal(): void {
  // Never persist invalid JSON (backs up the disabled Save button).
  if (!jsonTarget || !validateJsonModal()) {
    return;
  }
  pushUndo();
  const text = jsonModalText.value.trim();
  const { model, column, input, cell } = jsonTarget;
  const next = text === '' ? (column.isNullable ? null : '') : compactJson(text);
  model.values[column.name] = next;
  input.value = next ?? '';
  input.classList.toggle('null', next === null);
  applyCellState(cell, model, column);
  refreshPending();
  closeJsonModal();
}

// Valid JSON is stored compact; anything else is saved verbatim (never blocks the save).
function compactJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

function closeJsonModal(): void {
  jsonModal.hidden = true;
  jsonTarget = null;
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

// A new row starts empty (NULL), except enums: pre-select the column's default value, or the
// first enum value, so the cell shows a valid choice rather than NULL.
function defaultForNewRow(column: ColumnMeta): CellValue {
  const options = enumValues(column.type);
  if (options && options.length > 0) {
    return column.defaultValue !== null && options.includes(column.defaultValue) ? column.defaultValue : options[0];
  }
  return null;
}

function commit(): void {
  const edits = computeEdits();
  if (edits.length > 0) {
    api.postMessage({ type: 'commit', edits });
  }
}

function computeEdits(): EditDto[] {
  const edits: EditDto[] = [];
  for (const model of rowModels) {
    if (model.original === null) {
      appendInsert(edits, model);
    } else if (model.deleted) {
      edits.push({ op: 'delete', pk: pick(model.original, pkColumns) });
    } else {
      appendUpdate(edits, model, model.original);
    }
  }
  return edits;
}

function appendInsert(edits: EditDto[], model: RowModel): void {
  if (model.deleted) {
    return;
  }
  const values: Row = {};
  for (const column of columns) {
    if (model.values[column.name] !== null) {
      values[column.name] = model.values[column.name];
    }
  }
  if (Object.keys(values).length > 0) {
    edits.push({ op: 'insert', values });
  }
}

function appendUpdate(edits: EditDto[], model: RowModel, original: Record<string, CellValue>): void {
  const set: Row = {};
  for (const column of columns) {
    if (model.values[column.name] !== original[column.name]) {
      set[column.name] = model.values[column.name];
    }
  }
  if (Object.keys(set).length > 0) {
    edits.push({ op: 'update', pk: pick(original, pkColumns), set });
  }
}

function refreshPending(): void {
  const count = computeEdits().length;
  const dirty = hasLocalChanges();
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
}

function hasLocalChanges(): boolean {
  return rowModels.some((model) => {
    if (model.original === null || model.deleted) {
      return true;
    }
    const original = model.original;
    return columns.some((column) => model.values[column.name] !== original[column.name]);
  });
}

function pick(row: Record<string, CellValue>, keys: string[]): Row {
  const picked: Row = {};
  for (const key of keys) {
    picked[key] = row[key];
  }
  return picked;
}

function toCellRow(row: Row): Record<string, CellValue> {
  const cells: Record<string, CellValue> = {};
  for (const key of Object.keys(row)) {
    const value = row[key];
    cells[key] = value === null || value === undefined ? null : String(value);
  }
  return cells;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing element #${id}`);
  }
  return found as T;
}
