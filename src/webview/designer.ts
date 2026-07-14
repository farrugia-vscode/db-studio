import type { ColumnDraft, DriverKind, ForeignKeyDraft, IndexDraft } from '../domain/types';
import type { DesignerToExtension, ExtensionToDesigner } from '../domain/designerProtocol';

interface VsCodeApi {
  postMessage(message: DesignerToExtension): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

const TYPE_GROUPS: Record<DriverKind, Array<{ label: string; types: string[] }>> = {
  mysql: [
    { label: 'Numeric', types: ['int', 'bigint', 'tinyint', 'smallint', 'mediumint', 'decimal', 'float', 'double'] },
    { label: 'Text', types: ['varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext', 'json'] },
    { label: 'Date & time', types: ['date', 'datetime', 'timestamp', 'time', 'year'] },
    { label: 'Boolean', types: ['boolean'] },
    { label: 'Binary', types: ['binary', 'varbinary', 'blob'] },
  ],
  postgres: [
    { label: 'Numeric', types: ['integer', 'bigint', 'smallint', 'serial', 'bigserial', 'numeric', 'real', 'double precision'] },
    { label: 'Text', types: ['varchar', 'char', 'text', 'json', 'jsonb', 'uuid'] },
    { label: 'Date & time', types: ['date', 'timestamp', 'timestamptz', 'time'] },
    { label: 'Boolean', types: ['boolean'] },
    { label: 'Binary', types: ['bytea'] },
  ],
};

function flatTypes(kind: DriverKind): string[] {
  return TYPE_GROUPS[kind].flatMap((group) => group.types);
}
let mode: 'create' | 'modify' = 'create';
let driver: DriverKind = 'mysql';
let columns: ColumnDraft[] = [];
let indexes: IndexDraft[] = [];
let foreignKeys: ForeignKeyDraft[] = [];
let tables: string[] = [];
const refColumnsCache: Record<string, string[]> = {};

const body = byId<HTMLTableSectionElement>('columnsBody');
const indexesBody = byId<HTMLTableSectionElement>('indexesBody');
const fksBody = byId<HTMLTableSectionElement>('fksBody');
const tableNameInput = byId<HTMLInputElement>('tableName');
const tableNameWrap = byId<HTMLLabelElement>('tableNameWrap');
const applyButton = byId<HTMLButtonElement>('apply');
const sqlEl = byId<HTMLPreElement>('sql');
const notice = byId<HTMLDivElement>('notice');

byId<HTMLButtonElement>('addColumn').addEventListener('click', addColumn);
byId<HTMLButtonElement>('addIndex').addEventListener('click', addIndex);
byId<HTMLButtonElement>('addFk').addEventListener('click', addFk);
applyButton.addEventListener('click', () => send('apply'));
tableNameInput.addEventListener('input', changed);

let previewTimer = 0;

window.addEventListener('message', (event: MessageEvent<ExtensionToDesigner>) => {
  const message = event.data;
  if (message.type === 'init') {
    mode = message.mode;
    driver = message.driver;
    tableNameInput.value = message.table;
    tableNameWrap.style.display = mode === 'create' ? '' : 'none';
    columns = message.design.columns;
    indexes = message.design.indexes;
    foreignKeys = message.design.foreignKeys;
    tables = message.tables;
    notice.textContent = '';
    notice.classList.remove('error');
    render();
    return;
  }
  if (message.type === 'refColumns') {
    refColumnsCache[message.table] = message.columns;
    render();
    return;
  }
  if (message.type === 'sql') {
    sqlEl.textContent = message.sql;
    return;
  }
  if (message.type === 'error') {
    notice.textContent = message.message;
    notice.classList.add('error');
  }
});

api.postMessage({ type: 'ready' });

function send(kind: 'preview' | 'apply'): void {
  api.postMessage({ type: kind, table: tableNameInput.value.trim(), design: { columns, indexes, foreignKeys } });
}

// Any change re-validates (gates Apply) immediately and refreshes the SQL preview (debounced).
function changed(): void {
  validate();
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => send('preview'), 200);
}

function validate(): void {
  const active = columns.filter((column) => !column.drop);
  const nameOk = mode === 'modify' || tableNameInput.value.trim() !== '';
  const columnsOk = active.length > 0 && active.every((column) => column.name.trim() !== '' && column.type.trim() !== '');
  applyButton.disabled = !(nameOk && columnsOk);
}

function addColumn(): void {
  columns.push({
    originalName: null,
    name: '',
    type: flatTypes(driver)[0],
    isNullable: true,
    isPrimaryKey: false,
    isAutoIncrement: false,
    defaultValue: null,
    drop: false,
  });
  render();
}

function render(): void {
  body.replaceChildren(...columns.map((draft, index) => buildRow(draft, index)));
  indexesBody.replaceChildren(...indexes.map((draft, index) => buildIndexRow(draft, index)));
  fksBody.replaceChildren(...foreignKeys.map((draft, index) => buildFkRow(draft, index)));
  changed();
}

function addIndex(): void {
  indexes.push({ originalName: null, name: '', isUnique: false, columns: [], drop: false });
  render();
}

function addFk(): void {
  foreignKeys.push({ originalName: null, name: '', columns: [], refTable: '', refColumns: [], onDelete: '', drop: false });
  render();
}

function designedColumnNames(): string[] {
  return columns.filter((column) => !column.drop && column.name.trim() !== '').map((column) => column.name);
}

function buildIndexRow(draft: IndexDraft, index: number): HTMLTableRowElement {
  const row = document.createElement('tr');
  if (draft.drop) {
    row.classList.add('dropped');
  }
  row.appendChild(rowAction(draft, () => indexes.splice(index, 1)));
  row.appendChild(textCell(draft.name, (value) => (draft.name = value)));
  row.appendChild(checkCell(draft.isUnique, (value) => (draft.isUnique = value)));
  row.appendChild(multiSelectCell(designedColumnNames(), draft.columns, (values) => (draft.columns = values)));
  return row;
}

function buildFkRow(draft: ForeignKeyDraft, index: number): HTMLTableRowElement {
  const row = document.createElement('tr');
  if (draft.drop) {
    row.classList.add('dropped');
  }
  ensureRefColumns(draft.refTable);
  row.appendChild(rowAction(draft, () => foreignKeys.splice(index, 1)));
  row.appendChild(textCell(draft.name, (value) => (draft.name = value)));
  row.appendChild(multiSelectCell(designedColumnNames(), draft.columns, (values) => (draft.columns = values)));
  row.appendChild(refTableCell(draft));
  row.appendChild(multiSelectCell(refColumnsCache[draft.refTable] ?? draft.refColumns, draft.refColumns, (values) => (draft.refColumns = values)));
  row.appendChild(onDeleteCell(draft));
  return row;
}

function refTableCell(draft: ForeignKeyDraft): HTMLTableCellElement {
  const cell = document.createElement('td');
  const select = document.createElement('select');
  select.appendChild(new Option('(table)', ''));
  const options = draft.refTable && !tables.includes(draft.refTable) ? [...tables, draft.refTable] : tables;
  for (const table of options) {
    select.appendChild(new Option(table, table));
  }
  select.value = draft.refTable;
  select.addEventListener('change', () => {
    draft.refTable = select.value;
    draft.refColumns = [];
    ensureRefColumns(select.value);
    render();
  });
  cell.appendChild(select);
  return cell;
}

function ensureRefColumns(table: string): void {
  if (table.trim() !== '' && !refColumnsCache[table]) {
    api.postMessage({ type: 'refColumns', table });
  }
}

function multiSelectCell(options: string[], selected: string[], onChange: (values: string[]) => void): HTMLTableCellElement {
  const cell = document.createElement('td');
  const select = document.createElement('select');
  select.multiple = true;
  select.className = 'multi';
  const all = [...new Set([...options, ...selected])];
  for (const option of all) {
    select.appendChild(new Option(option, option, false, selected.includes(option)));
  }
  select.size = Math.min(Math.max(all.length, 2), 4);
  select.addEventListener('change', () => {
    onChange([...select.selectedOptions].map((option) => option.value));
    changed();
  });
  cell.appendChild(select);
  return cell;
}

function rowAction(draft: { originalName: string | null; drop: boolean }, remove: () => void): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.className = 'actions';
  const button = document.createElement('button');
  button.textContent = draft.drop ? '↺' : '×';
  button.addEventListener('click', () => {
    if (mode === 'modify' && draft.originalName) {
      draft.drop = !draft.drop;
    } else {
      remove();
    }
    render();
  });
  cell.appendChild(button);
  return cell;
}

function onDeleteCell(draft: ForeignKeyDraft): HTMLTableCellElement {
  const cell = document.createElement('td');
  const select = document.createElement('select');
  for (const option of ['', 'CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION']) {
    select.appendChild(new Option(option === '' ? '(none)' : option, option));
  }
  select.value = draft.onDelete;
  select.addEventListener('change', () => {
    draft.onDelete = select.value;
    changed();
  });
  cell.appendChild(select);
  return cell;
}


function buildRow(draft: ColumnDraft, index: number): HTMLTableRowElement {
  const row = document.createElement('tr');
  if (draft.drop) {
    row.classList.add('dropped');
  }
  row.appendChild(buildActions(draft, index));
  row.appendChild(textCell(draft.name, (value) => (draft.name = value)));
  appendTypeCells(row, draft);
  row.appendChild(checkCell(draft.isNullable, (value) => (draft.isNullable = value)));
  row.appendChild(checkCell(draft.isPrimaryKey, (value) => (draft.isPrimaryKey = value)));
  row.appendChild(checkCell(draft.isAutoIncrement, (value) => (draft.isAutoIncrement = value)));
  row.appendChild(textCell(draft.defaultValue ?? '', (value) => (draft.defaultValue = value === '' ? null : value)));
  return row;
}

function appendTypeCells(row: HTMLTableRowElement, draft: ColumnDraft): void {
  const parsed = splitType(draft.type);
  const list = flatTypes(driver);

  const typeCell = document.createElement('td');
  const select = document.createElement('select');
  for (const group of TYPE_GROUPS[driver]) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    for (const type of group.types) {
      optgroup.appendChild(new Option(type, type));
    }
    select.appendChild(optgroup);
  }
  if (parsed.base && !list.includes(parsed.base)) {
    select.appendChild(new Option(parsed.base, parsed.base));
  }
  select.value = parsed.base || list[0];
  typeCell.appendChild(select);

  const sizeCell = document.createElement('td');
  const sizeInput = document.createElement('input');
  sizeInput.value = parsed.size;
  sizeInput.placeholder = 'size';
  sizeCell.appendChild(sizeInput);

  const update = (): void => {
    draft.type = combineType(select.value, sizeInput.value);
    changed();
  };
  select.addEventListener('change', update);
  sizeInput.addEventListener('input', update);

  row.appendChild(typeCell);
  row.appendChild(sizeCell);
}

function splitType(type: string): { base: string; size: string } {
  const match = /^(.*?)\(([^)]*)\)/.exec(type.trim());
  if (match) {
    return { base: match[1].trim().toLowerCase(), size: match[2].trim() };
  }
  return { base: type.trim().toLowerCase(), size: '' };
}

function combineType(base: string, size: string): string {
  return size.trim() !== '' ? `${base}(${size})` : base;
}

function buildActions(draft: ColumnDraft, index: number): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.className = 'actions';
  const button = document.createElement('button');
  button.textContent = draft.drop ? '↺' : '×';
  button.title = draft.drop ? 'Keep column' : 'Remove column';
  button.addEventListener('click', () => {
    if (mode === 'modify' && draft.originalName) {
      draft.drop = !draft.drop;
    } else {
      columns.splice(index, 1);
    }
    render();
  });
  cell.appendChild(button);
  return cell;
}

function textCell(value: string, onChange: (value: string) => void): HTMLTableCellElement {
  const cell = document.createElement('td');
  const input = document.createElement('input');
  input.value = value;
  input.spellcheck = false;
  input.addEventListener('input', () => {
    onChange(input.value);
    changed();
  });
  cell.appendChild(input);
  return cell;
}

function checkCell(value: boolean, onChange: (value: boolean) => void): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.className = 'check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.addEventListener('change', () => {
    onChange(input.checked);
    changed();
  });
  cell.appendChild(input);
  return cell;
}

function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing element #${id}`);
  }
  return found as T;
}
