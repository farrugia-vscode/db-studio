import type { ConsoleTableSchema, ConsoleToExtension, ExtensionToConsole } from '../domain/consoleProtocol';

interface VsCodeApi {
  postMessage(message: ConsoleToExtension): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

const editor = byId<HTMLTextAreaElement>('editor');
const runButton = byId<HTMLButtonElement>('run');
const status = byId<HTMLSpanElement>('status');
const resultTable = byId<HTMLTableElement>('result');
const acList = byId<HTMLUListElement>('autocomplete');

// Common SQL keywords offered by autocomplete alongside the schema.
const KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'INSERT INTO', 'UPDATE', 'DELETE FROM', 'SET', 'VALUES',
  'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'JOIN', 'ON', 'GROUP BY', 'ORDER BY', 'HAVING',
  'LIMIT', 'OFFSET', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'IS NULL', 'IS NOT NULL', 'IN',
  'LIKE', 'BETWEEN', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ASC', 'DESC',
];
// Keywords after which the next word is a table name.
const TABLE_KEYWORDS = new Set(['FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE']);

type Suggestion = { label: string; kind: 'table' | 'column' | 'keyword' };

let schema: ConsoleTableSchema[] = [];
let columnsByTable = new Map<string, string[]>();
let suggestions: Suggestion[] = [];
let activeIndex = 0;
// The [start, end) span of the partial token being completed.
let tokenStart = 0;

let saveTimer = 0;

runButton.addEventListener('click', run);
editor.addEventListener('input', () => {
  scheduleSave();
  updateAutocomplete();
});
editor.addEventListener('keydown', onEditorKeydown);
editor.addEventListener('blur', () => window.setTimeout(closeAutocomplete, 120));
editor.addEventListener('scroll', closeAutocomplete);

window.addEventListener('message', (event: MessageEvent<ExtensionToConsole>) => {
  const message = event.data;
  if (message.type === 'init') {
    editor.value = message.sql;
    return;
  }
  if (message.type === 'schema') {
    schema = message.tables;
    columnsByTable = new Map(schema.map((table) => [table.name.toLowerCase(), table.columns]));
    return;
  }
  if (message.type === 'result') {
    renderResult(message);
  }
});

api.postMessage({ type: 'ready' });

function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => api.postMessage({ type: 'save', sql: editor.value }), 400);
}

function onEditorKeydown(event: KeyboardEvent): void {
  if (!acList.hidden) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      acceptSuggestion(suggestions[activeIndex]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAutocomplete();
      return;
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    run();
  } else if (event.key === 'Tab') {
    event.preventDefault();
    insertAtCursor('  ');
  }
}

// ---- Autocomplete ----

function updateAutocomplete(): void {
  const caret = editor.selectionStart;
  const before = editor.value.slice(0, caret);
  // The token under the caret: word chars, optionally qualified by `alias.`.
  const match = /([A-Za-z_][\w]*\.)?([A-Za-z_]\w*)?$/.exec(before);
  const qualifier = match?.[1]?.slice(0, -1) ?? '';
  const partial = match?.[2] ?? '';
  tokenStart = caret - partial.length;

  if (qualifier) {
    suggestions = columnSuggestions(qualifier, partial);
  } else if (partial.length === 0) {
    closeAutocomplete();
    return;
  } else {
    suggestions = wordSuggestions(before, partial);
  }
  if (suggestions.length === 0) {
    closeAutocomplete();
    return;
  }
  activeIndex = 0;
  renderAutocomplete();
}

function columnSuggestions(qualifier: string, partial: string): Suggestion[] {
  const table = resolveAlias(qualifier);
  const columns = columnsByTable.get(table.toLowerCase()) ?? [];
  return columns
    .filter((column) => column.toLowerCase().startsWith(partial.toLowerCase()))
    .map((column) => ({ label: column, kind: 'column' as const }));
}

function wordSuggestions(before: string, partial: string): Suggestion[] {
  const lower = partial.toLowerCase();
  const previousWord = /(\w+)\s+$/.exec(before.slice(0, before.length - partial.length))?.[1]?.toUpperCase() ?? '';
  const preferTables = TABLE_KEYWORDS.has(previousWord);

  const tables: Suggestion[] = schema
    .filter((table) => table.name.toLowerCase().startsWith(lower))
    .map((table) => ({ label: table.name, kind: 'table' as const }));
  const columns: Suggestion[] = uniqueColumns()
    .filter((column) => column.toLowerCase().startsWith(lower))
    .map((column) => ({ label: column, kind: 'column' as const }));
  const keywords: Suggestion[] = KEYWORDS
    .filter((keyword) => keyword.toLowerCase().startsWith(lower))
    .map((keyword) => ({ label: keyword, kind: 'keyword' as const }));

  const ordered = preferTables ? [...tables, ...keywords, ...columns] : [...keywords, ...tables, ...columns];
  return ordered.slice(0, 50);
}

// Map a table alias (or a bare table name) used in FROM/JOIN back to its real table name.
function resolveAlias(qualifier: string): string {
  const pattern = new RegExp(`(?:from|join|update|into)\\s+([A-Za-z_]\\w*)\\s+(?:as\\s+)?${escapeRegExp(qualifier)}\\b`, 'i');
  return pattern.exec(editor.value)?.[1] ?? qualifier;
}

let cachedColumns: string[] | null = null;
function uniqueColumns(): string[] {
  if (cachedColumns && cachedColumns.length > 0) {
    return cachedColumns;
  }
  const seen = new Set<string>();
  for (const table of schema) {
    for (const column of table.columns) {
      seen.add(column);
    }
  }
  cachedColumns = [...seen];
  return cachedColumns;
}

function renderAutocomplete(): void {
  acList.replaceChildren();
  suggestions.forEach((suggestion, index) => {
    const item = document.createElement('li');
    if (index === activeIndex) {
      item.classList.add('active');
    }
    const label = document.createElement('span');
    label.textContent = suggestion.label;
    const kind = document.createElement('span');
    kind.className = 'kind';
    kind.textContent = suggestion.kind;
    item.append(label, kind);
    item.addEventListener('mousedown', (event) => {
      event.preventDefault();
      acceptSuggestion(suggestion);
    });
    acList.appendChild(item);
  });
  positionAutocomplete();
  acList.hidden = false;
}

function moveActive(delta: number): void {
  activeIndex = (activeIndex + delta + suggestions.length) % suggestions.length;
  const items = acList.children;
  for (let index = 0; index < items.length; index += 1) {
    items[index].classList.toggle('active', index === activeIndex);
  }
  items[activeIndex]?.scrollIntoView({ block: 'nearest' });
}

function acceptSuggestion(suggestion: Suggestion | undefined): void {
  if (!suggestion) {
    return;
  }
  const caret = editor.selectionStart;
  const value = editor.value;
  editor.value = value.slice(0, tokenStart) + suggestion.label + value.slice(caret);
  const nextCaret = tokenStart + suggestion.label.length;
  editor.selectionStart = editor.selectionEnd = nextCaret;
  closeAutocomplete();
  editor.focus();
  scheduleSave();
}

function closeAutocomplete(): void {
  acList.hidden = true;
  suggestions = [];
}

// Position the popup just under the caret using a mirror element to measure coordinates.
function positionAutocomplete(): void {
  const coords = caretCoordinates(editor, tokenStart);
  acList.style.left = `${coords.left}px`;
  acList.style.top = `${coords.top + coords.height}px`;
}

const MIRROR_PROPS = [
  'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'whiteSpace',
] as const;

function caretCoordinates(field: HTMLTextAreaElement, position: number): { left: number; top: number; height: number } {
  const mirror = document.createElement('div');
  const style = getComputedStyle(field);
  for (const prop of MIRROR_PROPS) {
    mirror.style[prop] = style[prop];
  }
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.textContent = field.value.slice(0, position);
  const marker = document.createElement('span');
  marker.textContent = field.value.slice(position) || '.';
  mirror.appendChild(marker);
  field.parentElement!.appendChild(mirror);
  const left = marker.offsetLeft - field.scrollLeft;
  const top = marker.offsetTop - field.scrollTop;
  const height = parseFloat(style.lineHeight) || marker.offsetHeight;
  field.parentElement!.removeChild(mirror);
  return { left, top, height };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---- Query execution & results ----

function run(): void {
  const selection = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  const sql = selection.trim() !== '' ? selection : editor.value;
  if (sql.trim() === '') {
    return;
  }
  closeAutocomplete();
  status.textContent = 'Running…';
  api.postMessage({ type: 'run', sql });
}

function renderResult(message: ExtensionToConsole & { type: 'result' }): void {
  if (message.error) {
    status.textContent = '';
    resultTable.replaceChildren();
    resultTable.classList.add('error-view');
    resultTable.textContent = message.error;
    return;
  }
  resultTable.classList.remove('error-view');
  resultTable.textContent = '';
  if (message.columns.length === 0) {
    status.textContent = `Query OK · ${message.affectedRows ?? 0} row(s) affected`;
    resultTable.replaceChildren();
    return;
  }
  status.textContent = `${message.rows.length} row(s)`;

  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const column of message.columns) {
    const th = document.createElement('th');
    th.textContent = column;
    headRow.appendChild(th);
  }
  head.appendChild(headRow);

  const bodyEl = document.createElement('tbody');
  for (const row of message.rows) {
    const tr = document.createElement('tr');
    for (const cell of row) {
      const td = document.createElement('td');
      if (cell === null) {
        td.textContent = 'NULL';
        td.className = 'null';
      } else {
        td.textContent = cell;
      }
      tr.appendChild(td);
    }
    bodyEl.appendChild(tr);
  }
  resultTable.replaceChildren(head, bodyEl);
}

function insertAtCursor(text: string): void {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  editor.value = editor.value.slice(0, start) + text + editor.value.slice(end);
  editor.selectionStart = editor.selectionEnd = start + text.length;
  api.postMessage({ type: 'save', sql: editor.value });
}

function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing element #${id}`);
  }
  return found as T;
}
