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

const grid = element<HTMLTableElement>('grid');
const notice = element<HTMLDivElement>('notice');
const status = element<HTMLSpanElement>('status');
const addRowButton = element<HTMLButtonElement>('addRow');
const commitButton = element<HTMLButtonElement>('commit');
const revertButton = element<HTMLButtonElement>('revert');
const reloadButton = element<HTMLButtonElement>('reload');

addRowButton.addEventListener('click', addRow);
commitButton.addEventListener('click', commit);
revertButton.addEventListener('click', () => api.postMessage({ type: 'reload' }));
reloadButton.addEventListener('click', () => api.postMessage({ type: 'reload' }));

window.addEventListener('message', (event: MessageEvent<ExtensionToWebview>) => {
  const message = event.data;
  if (message.type === 'data') {
    loadData(message.columns, message.pkColumns, message.rows);
    return;
  }
  if (message.type === 'error') {
    notice.textContent = message.message;
    notice.classList.add('error');
  }
});

api.postMessage({ type: 'ready' });

function loadData(nextColumns: ColumnMeta[], nextPkColumns: string[], rows: Row[]): void {
  columns = nextColumns;
  pkColumns = nextPkColumns;
  hasPrimaryKey = nextPkColumns.length > 0;
  rowModels = rows.map((row) => ({ values: toCellRow(row), original: toCellRow(row), deleted: false }));
  notice.classList.remove('error');
  notice.textContent = hasPrimaryKey ? '' : 'Read-only: this table has no primary key, rows cannot be edited safely.';
  addRowButton.disabled = !hasPrimaryKey;
  render();
  refreshPending();
}

function render(): void {
  grid.replaceChildren(buildHead(), buildBody());
}

function buildHead(): HTMLTableSectionElement {
  const head = document.createElement('thead');
  const row = document.createElement('tr');
  row.appendChild(document.createElement('th'));
  for (const column of columns) {
    const cell = document.createElement('th');
    cell.textContent = column.name;
    if (column.isPrimaryKey) {
      cell.classList.add('pk');
    }
    row.appendChild(cell);
  }
  head.appendChild(row);
  return head;
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
  // Revert is available for any local change — including freshly added (still empty) rows.
  revertButton.disabled = !dirty;
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
