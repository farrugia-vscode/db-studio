import type { ConsoleToExtension, ExtensionToConsole } from '../domain/consoleProtocol';

interface VsCodeApi {
  postMessage(message: ConsoleToExtension): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

const editor = byId<HTMLTextAreaElement>('editor');
const runButton = byId<HTMLButtonElement>('run');
const status = byId<HTMLSpanElement>('status');
const resultTable = byId<HTMLTableElement>('result');

let saveTimer = 0;

runButton.addEventListener('click', run);
editor.addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => api.postMessage({ type: 'save', sql: editor.value }), 400);
});
editor.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    run();
  } else if (event.key === 'Tab') {
    event.preventDefault();
    insertAtCursor('  ');
  }
});

window.addEventListener('message', (event: MessageEvent<ExtensionToConsole>) => {
  const message = event.data;
  if (message.type === 'init') {
    editor.value = message.sql;
    return;
  }
  if (message.type === 'result') {
    renderResult(message);
  }
});

api.postMessage({ type: 'ready' });

function run(): void {
  const selection = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  const sql = selection.trim() !== '' ? selection : editor.value;
  if (sql.trim() === '') {
    return;
  }
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
