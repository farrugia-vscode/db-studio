import type { ExtensionToWebview, WebviewToExtension } from '../domain/gridProtocol';
import type { ColumnMeta, Row } from '../domain/types';
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
let pkColumns: string[] = [];
let rowModels: RowModel[] = [];
let hasPrimaryKey = false;
let colElements: HTMLTableColElement[] = [];

const MIN_WIDTH = 56;
const INITIAL_MAX_WIDTH = 360;
const CELL_PADDING = 26;
const measureCtx = document.createElement('canvas').getContext('2d');
let cellFont = '12px monospace';

const grid = element<HTMLTableElement>('grid');
const notice = element<HTMLDivElement>('notice');
const status = element<HTMLSpanElement>('status');
const commitButton = element<HTMLButtonElement>('commit');
const reloadButton = element<HTMLButtonElement>('reload');

commitButton.addEventListener('click', commit);
reloadButton.addEventListener('click', () => api.postMessage({ type: 'reload' }));

window.addEventListener('message', (event: MessageEvent<ExtensionToWebview>) => {
  const message = event.data;
  if (message.type === 'data') {
    applyColor(message.color);
    loadData(message.columns, message.pkColumns, message.rows);
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
  document.body.classList.toggle('tinted', Boolean(color));
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
}

function measureColumn(index: number, maxWidth: number): number {
  if (!measureCtx) {
    return 150;
  }
  measureCtx.font = cellFont;
  const column = columns[index];
  let widest = measureCtx.measureText(column.name).width + (column.isPrimaryKey ? 16 : 0);
  for (const model of rowModels) {
    const value = model.values[column.name];
    const width = measureCtx.measureText(value ?? 'NULL').width;
    if (width > widest) {
      widest = width;
    }
  }
  return Math.min(maxWidth, Math.max(MIN_WIDTH, Math.ceil(widest) + CELL_PADDING));
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
    model.deleted = !model.deleted;
    applyRowState(row, model);
    refreshPending();
  });
  cell.appendChild(button);
  return cell;
}

function buildCell(model: RowModel, column: ColumnMeta): HTMLTableCellElement {
  const cell = document.createElement('td');
  const input = document.createElement('input');
  const isInserted = model.original === null;
  // The DB fills auto-increment / identity columns itself, so a new row shows <generated>.
  const isGenerated = column.isAutoIncrement && isInserted;
  const isReadOnly = !hasPrimaryKey || isGenerated || (column.isPrimaryKey && !isInserted);
  const value = model.values[column.name];
  input.value = value ?? '';
  input.readOnly = isReadOnly;
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
    model.values[column.name] = readInput(input, column);
    input.classList.toggle('null', model.values[column.name] === null);
    applyCellState(cell, model, column);
    refreshPending();
  });
  applyCellState(cell, model, column);
  cell.appendChild(input);
  return cell;
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
  commitButton.disabled = count === 0;
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
