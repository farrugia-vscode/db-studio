import type { ColumnDraft, DriverKind } from '../domain/types';
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

const body = byId<HTMLTableSectionElement>('columnsBody');
const tableNameInput = byId<HTMLInputElement>('tableName');
const tableNameWrap = byId<HTMLLabelElement>('tableNameWrap');
const applyButton = byId<HTMLButtonElement>('apply');
const sqlEl = byId<HTMLPreElement>('sql');
const notice = byId<HTMLDivElement>('notice');

byId<HTMLButtonElement>('addColumn').addEventListener('click', addColumn);
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
    columns = message.columns;
    notice.textContent = '';
    notice.classList.remove('error');
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
  api.postMessage({ type: kind, table: tableNameInput.value.trim(), columns });
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
  changed();
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
