import type { ColumnDraft } from '../domain/types';
import type { DesignerToExtension, ExtensionToDesigner } from '../domain/designerProtocol';

interface VsCodeApi {
  postMessage(message: DesignerToExtension): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

let mode: 'create' | 'modify' = 'create';
let columns: ColumnDraft[] = [];

const body = byId<HTMLTableSectionElement>('columnsBody');
const tableNameInput = byId<HTMLInputElement>('tableName');
const tableNameWrap = byId<HTMLLabelElement>('tableNameWrap');
const sqlEl = byId<HTMLPreElement>('sql');
const notice = byId<HTMLDivElement>('notice');

byId<HTMLButtonElement>('addColumn').addEventListener('click', addColumn);
byId<HTMLButtonElement>('preview').addEventListener('click', () => send('preview'));
byId<HTMLButtonElement>('apply').addEventListener('click', () => send('apply'));

window.addEventListener('message', (event: MessageEvent<ExtensionToDesigner>) => {
  const message = event.data;
  if (message.type === 'init') {
    mode = message.mode;
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

function addColumn(): void {
  columns.push({
    originalName: null,
    name: '',
    type: 'varchar(255)',
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
}

function buildRow(draft: ColumnDraft, index: number): HTMLTableRowElement {
  const row = document.createElement('tr');
  if (draft.drop) {
    row.classList.add('dropped');
  }
  row.appendChild(buildActions(draft, index));
  row.appendChild(textCell(draft.name, (value) => (draft.name = value)));
  row.appendChild(textCell(draft.type, (value) => (draft.type = value)));
  row.appendChild(checkCell(draft.isNullable, (value) => (draft.isNullable = value)));
  row.appendChild(checkCell(draft.isPrimaryKey, (value) => (draft.isPrimaryKey = value)));
  row.appendChild(checkCell(draft.isAutoIncrement, (value) => (draft.isAutoIncrement = value)));
  row.appendChild(textCell(draft.defaultValue ?? '', (value) => (draft.defaultValue = value === '' ? null : value)));
  return row;
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
  input.addEventListener('input', () => onChange(input.value));
  cell.appendChild(input);
  return cell;
}

function checkCell(value: boolean, onChange: (value: boolean) => void): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.className = 'check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
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
