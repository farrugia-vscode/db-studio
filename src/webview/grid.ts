import type { ExtensionToWebview, WebviewToExtension } from '../domain/gridProtocol';
import type { ColumnMeta, Row } from '../domain/types';
import type { EditDto } from '../domain/edits/edit';
import { titleForeground } from '../domain/color';

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
let pkColumns: string[] = [];
let rowModels: RowModel[] = [];
let hasPrimaryKey = false;
let colElements: HTMLTableColElement[] = [];
let dateLocale = '';

const MIN_WIDTH = 56;
const INITIAL_MAX_WIDTH = 360;
const CELL_PADDING = 34;
const measureCtx = document.createElement('canvas').getContext('2d');
let cellFont = '12px monospace';

const grid = element<HTMLTableElement>('grid');
const notice = element<HTMLDivElement>('notice');
const status = element<HTMLSpanElement>('status');
const commitButton = element<HTMLButtonElement>('commit');
const reloadButton = element<HTMLButtonElement>('reload');
const filterInput = element<HTMLInputElement>('filter');
const pagerFirst = element<HTMLButtonElement>('pagerFirst');
const pagerPrev = element<HTMLButtonElement>('pagerPrev');
const pagerNext = element<HTMLButtonElement>('pagerNext');
const pagerLast = element<HTMLButtonElement>('pagerLast');
const pagerInfo = element<HTMLSpanElement>('pagerInfo');
const pageSizeInput = element<HTMLSelectElement>('pageSize');

let total = 0;
let offset = 0;
let pageSize = 100;

commitButton.addEventListener('click', commit);
reloadButton.addEventListener('click', () => api.postMessage({ type: 'reload' }));
// The 'search' event fires on Enter and when the native clear (×) is clicked.
filterInput.addEventListener('search', () => api.postMessage({ type: 'filter', value: filterInput.value }));

// Ctrl/Cmd+C on a focused cell copies its whole value when nothing is selected.
document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.key !== 'c') {
    return;
  }
  const active = document.activeElement;
  if (active instanceof HTMLInputElement && active.closest('td') && active.selectionStart === active.selectionEnd) {
    void navigator.clipboard.writeText(active.value);
  }
});
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

let jsonTarget: { model: RowModel; column: ColumnMeta; input: HTMLInputElement; cell: HTMLTableCellElement } | null = null;

jsonModalSave.addEventListener('click', saveJsonModal);
jsonModalCancel.addEventListener('click', closeJsonModal);
jsonModalText.addEventListener('input', validateJsonModal);
jsonModalText.addEventListener('keydown', onJsonKeydown);

window.addEventListener('message', (event: MessageEvent<ExtensionToWebview>) => {
  const message = event.data;
  if (message.type === 'data') {
    applyColor(message.color);
    total = message.total;
    offset = message.offset;
    pageSize = message.pageSize;
    dateLocale = message.dateLocale;
    loadData(message.columns, message.pkColumns, message.rows);
    updatePager();
    return;
  }
  if (message.type === 'color') {
    applyColor(message.color);
    return;
  }
  if (message.type === 'error') {
    notice.textContent = message.message;
    notice.classList.add('error');
  }
});

api.postMessage({ type: 'ready' });

function applyColor(color?: string): void {
  document.documentElement.style.setProperty('--conn', color ?? 'transparent');
  document.documentElement.style.setProperty('--title-fg', color ? titleForeground(color) : '#fff');
  document.body.classList.toggle('tinted', Boolean(color));
}

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
  pkColumns = nextPkColumns;
  hasPrimaryKey = nextPkColumns.length > 0;
  rowModels = rows.map((row) => ({ values: toCellRow(row), original: toCellRow(row), deleted: false }));
  notice.classList.remove('error');
  notice.textContent = hasPrimaryKey ? '' : 'Read-only: this table has no primary key, rows cannot be edited safely.';
  render();
  refreshPending();
}

function render(): void {
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
  cell.colSpan = columns.length + 1;
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
  for (const _column of columns) {
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
  columns.forEach((column, index) => {
    const cell = document.createElement('th');
    cell.textContent = column.name;
    if (column.isPrimaryKey) {
      cell.classList.add('pk');
    }
    cell.appendChild(buildResizer(index));
    row.appendChild(cell);
  });
  head.appendChild(row);
  return head;
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
  columns.forEach((_column, index) => autofit(index, maxWidth));
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
  const column = columns[index];
  const isDate = isDateColumn(column.type);
  let widest = measureCtx.measureText(column.name).width + (column.isPrimaryKey ? 16 : 0);
  for (const model of rowModels) {
    const value = model.values[column.name];
    const text = isDate && value !== null ? formatDate(value, dateLocale) : value ?? 'NULL';
    const width = measureCtx.measureText(text).width;
    if (width > widest) {
      widest = width;
    }
  }
  // Date columns need extra room for the native field's calendar/spinner controls in edit mode.
  const extra = isDate ? 34 : 0;
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
  for (const model of rowModels) {
    body.appendChild(buildRow(model));
  }
  return body;
}

function buildRow(model: RowModel): HTMLTableRowElement {
  const row = document.createElement('tr');
  applyRowState(row, model);
  row.appendChild(buildDeleteCell(model, row));
  for (const column of columns) {
    row.appendChild(buildCell(model, column));
  }
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
  const isJson = editable && column.type.toLowerCase().includes('json');
  const dateType = editable && !isJson ? dateInputType(column.type) : null;
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
  });

  if (isJson) {
    input.classList.add('json');
    input.addEventListener('dblclick', () => openJsonModal(model, column, input, cell));
  } else if (editable) {
    input.addEventListener('dblclick', () => {
      if (dateType) {
        input.type = dateType;
        if (dateType === 'datetime-local') {
          input.step = '1';
        }
        input.value = toDateInputValue(model.values[column.name], dateType);
        input.readOnly = false;
        input.focus();
      } else {
        beginInlineEdit(input);
      }
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        input.blur();
      } else if (event.key === 'Escape') {
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
  return cell;
}

function beginInlineEdit(input: HTMLInputElement): void {
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

function buildEnumCell(model: RowModel, column: ColumnMeta, options: string[]): HTMLTableCellElement {
  const cell = document.createElement('td');
  const select = document.createElement('select');
  select.className = 'cell-select';
  if (column.isNullable) {
    select.appendChild(new Option('NULL', ''));
  }
  for (const option of options) {
    select.appendChild(new Option(option, option));
  }
  select.value = model.values[column.name] ?? '';
  select.addEventListener('change', () => {
    model.values[column.name] = select.value === '' && column.isNullable ? null : select.value;
    applyCellState(cell, model, column);
    refreshPending();
  });
  select.addEventListener('focus', () => cell.classList.add('focused'));
  select.addEventListener('blur', () => cell.classList.remove('focused'));
  applyCellState(cell, model, column);
  cell.appendChild(select);
  return cell;
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

// Live validity: runs on every keystroke, colors the status and gates Save.
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

// Editor-like behaviour in the JSON textarea: Enter keeps/extends indentation, Tab inserts spaces.
function onJsonKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault();
    autoIndentNewline();
  } else if (event.key === 'Tab') {
    event.preventDefault();
    insertAtCursor('  ');
  }
}

function autoIndentNewline(): void {
  const value = jsonModalText.value;
  const start = jsonModalText.selectionStart;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const indent = /^[ \t]*/.exec(value.slice(lineStart, start))?.[0] ?? '';
  const opensBlock = value[start - 1] === '{' || value[start - 1] === '[';
  const closesAfter = value[start] === '}' || value[start] === ']';
  if (opensBlock && closesAfter) {
    const inner = `${indent}  `;
    replaceSelection(`\n${inner}\n${indent}`, start + 1 + inner.length);
  } else {
    const insert = `\n${indent}${opensBlock ? '  ' : ''}`;
    replaceSelection(insert, start + insert.length);
  }
}

function insertAtCursor(text: string): void {
  replaceSelection(text, jsonModalText.selectionStart + text.length);
}

function replaceSelection(text: string, caret: number): void {
  const value = jsonModalText.value;
  jsonModalText.value = value.slice(0, jsonModalText.selectionStart) + text + value.slice(jsonModalText.selectionEnd);
  jsonModalText.selectionStart = jsonModalText.selectionEnd = caret;
  validateJsonModal();
}

function saveJsonModal(): void {
  if (!jsonTarget || !validateJsonModal()) {
    return;
  }
  const text = jsonModalText.value.trim();
  const { model, column, input, cell } = jsonTarget;
  const next = text === '' ? (column.isNullable ? null : '') : JSON.stringify(JSON.parse(text));
  model.values[column.name] = next;
  input.value = next ?? '';
  input.classList.toggle('null', next === null);
  applyCellState(cell, model, column);
  refreshPending();
  closeJsonModal();
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
  const values: Record<string, CellValue> = {};
  for (const column of columns) {
    values[column.name] = null;
  }
  rowModels.push({ values, original: null, deleted: false });
  render();
  refreshPending();
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
  status.textContent = count > 0 ? `${count} pending change(s)` : dirty ? 'unsaved changes' : '';
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
