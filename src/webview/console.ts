// Import only the dialects we ship so esbuild tree-shakes the rest of sql-formatter.
import { formatDialect, mysql, postgresql, sqlite } from 'sql-formatter';
import type {
  ConsoleCellEdit,
  ConsoleResult,
  ConsoleTableSchema,
  ConsoleToExtension,
  ExtensionToConsole,
  HistoryEntry,
  Snippet,
} from '../domain/consoleProtocol';
import type { DriverKind } from '../domain/types';

interface VsCodeApi {
  postMessage(message: ConsoleToExtension): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

const editor = byId<HTMLTextAreaElement>('editor');
const highlightCode = byId<HTMLElement>('highlightCode');
const runButton = byId<HTMLButtonElement>('run');
const cancelButton = byId<HTMLButtonElement>('cancel');
const explainButton = byId<HTMLButtonElement>('explain');
const formatButton = byId<HTMLButtonElement>('format');
const syntaxHint = byId<HTMLSpanElement>('syntaxHint');
const status = byId<HTMLSpanElement>('status');
const resultTable = byId<HTMLTableElement>('result');
const resultTabs = byId<HTMLDivElement>('resultTabs');
const resultFooter = byId<HTMLDivElement>('resultFooter');
const acList = byId<HTMLUListElement>('autocomplete');
const historyToggle = byId<HTMLButtonElement>('historyToggle');
const historyPanel = byId<HTMLElement>('historyPanel');
const historyClose = byId<HTMLButtonElement>('historyClose');
const historyList = byId<HTMLUListElement>('historyList');
const historyEmpty = byId<HTMLSpanElement>('historyEmpty');
const historyCount = byId<HTMLSpanElement>('historyCount');
const historyFilter = byId<HTMLInputElement>('historyFilter');
const snippetsToggle = byId<HTMLButtonElement>('snippetsToggle');
const snippetsPanel = byId<HTMLElement>('snippetsPanel');
const snippetsClose = byId<HTMLButtonElement>('snippetsClose');
const snippetsEmpty = byId<HTMLSpanElement>('snippetsEmpty');
const snippetsCount = byId<HTMLSpanElement>('snippetsCount');
const snippetsFilter = byId<HTMLInputElement>('snippetsFilter');
const snippetsList = byId<HTMLUListElement>('snippetsList');
const snippetSave = byId<HTMLButtonElement>('snippetSave');
const editBar = byId<HTMLDivElement>('editBar');
const editCount = byId<HTMLSpanElement>('editCount');
const editSqlToggle = byId<HTMLButtonElement>('editSqlToggle');
const editSql = byId<HTMLPreElement>('editSql');
const editRevert = byId<HTMLButtonElement>('editRevert');
const editCommit = byId<HTMLButtonElement>('editCommit');
const historyExportCsv = byId<HTMLButtonElement>('historyExportCsv');
const historyExportMd = byId<HTMLButtonElement>('historyExportMd');
const historyClear = byId<HTMLButtonElement>('historyClear');

// Full history for this connection (newest first); the list is drawn filtered by historyFilter.
let historyEntries: HistoryEntry[] = [];
const schemaSelect = byId<HTMLSelectElement>('schema');

// The schema queries run against and autocomplete draws from.
let currentNamespace = '';
// The connection engine, used to format SQL in the right dialect.
const FORMATTER_DIALECTS = { mysql, postgres: postgresql, sqlite } as const satisfies Record<DriverKind, unknown>;

let driverKind: DriverKind = 'mysql';

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

runButton.addEventListener('click', () => run(false));
explainButton.addEventListener('click', () => run(true));
cancelButton.addEventListener('click', () => {
  cancelButton.disabled = true;
  status.textContent = 'Cancelling…';
  api.postMessage({ type: 'cancel' });
});
formatButton.addEventListener('click', formatEditor);
historyToggle.addEventListener('click', toggleHistory);
historyClose.addEventListener('click', () => setHistoryOpen(false));
historyFilter.addEventListener('input', drawHistory);
snippetsToggle.addEventListener('click', () => setSnippetsOpen(snippetsPanel.hidden));
snippetsClose.addEventListener('click', () => setSnippetsOpen(false));
snippetsFilter.addEventListener('input', drawSnippets);
snippetSave.addEventListener('click', saveSnippet);
historyExportCsv.addEventListener('click', () => exportHistory('csv'));
historyExportMd.addEventListener('click', () => exportHistory('markdown'));
historyClear.addEventListener('click', () => api.postMessage({ type: 'clearHistory' }));
schemaSelect.addEventListener('change', () => {
  currentNamespace = schemaSelect.value;
  cachedColumns = null;
  api.postMessage({ type: 'schemaChange', namespace: currentNamespace });
});
editor.addEventListener('input', () => {
  scheduleSave();
  updateAutocomplete();
});
editor.addEventListener('keydown', onEditorKeydown);
// The docked history panel stays open until toggled off; Escape still closes it.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !historyPanel.hidden) {
    setHistoryOpen(false);
  }
});
editor.addEventListener('blur', () => window.setTimeout(closeAutocomplete, 120));
editor.addEventListener('scroll', () => {
  closeAutocomplete();
  syncHighlightScroll();
});

window.addEventListener('message', (event: MessageEvent<ExtensionToConsole>) => {
  const message = event.data;
  if (message.type === 'init') {
    editor.value = message.sql;
    driverKind = message.driver;
    highlightEditor();
    showSyntaxHint();
    populateSchemas(message.namespaces, message.namespace);
    return;
  }
  if (message.type === 'selectSchema') {
    schemaSelect.value = message.namespace;
    currentNamespace = message.namespace;
    cachedColumns = null;
    api.postMessage({ type: 'schemaChange', namespace: currentNamespace });
    return;
  }
  if (message.type === 'schema') {
    schema = message.tables;
    columnsByTable = new Map(schema.map((table) => [table.name.toLowerCase(), table.columns]));
    cachedColumns = null;
    return;
  }
  if (message.type === 'history') {
    renderHistory(message.items);
    return;
  }
  if (message.type === 'snippets') {
    snippets = message.items;
    drawSnippets();
    return;
  }
  if (message.type === 'results') {
    renderResults(message.results);
    return;
  }
  if (message.type === 'updateResult') {
    onUpdateResult(message.count, message.error);
  }
});

api.postMessage({ type: 'ready' });
editRevert.addEventListener('click', revertEdits);
editCommit.addEventListener('click', commitEdits);
editSqlToggle.addEventListener('click', togglePendingSql);
setupEditorResizer();

function scheduleSave(): void {
  // Every content change flows through here, so it's the one place to refresh the highlight + check.
  highlightEditor();
  showSyntaxHint();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => api.postMessage({ type: 'save', sql: editor.value }), 400);
}

function showSyntaxHint(): void {
  const warning = sqlSyntaxWarning(editor.value);
  syntaxHint.textContent = warning ? `⚠ ${warning}` : '';
  syntaxHint.hidden = warning === null;
}

// A light, best-effort structural check — NOT a real parser. Catches the usual typos:
// unbalanced parentheses and unterminated strings/comments. Returns a short label, or null when clean.
function sqlSyntaxWarning(sql: string): string | null {
  let depth = 0;
  let index = 0;
  while (index < sql.length) {
    const char = sql[index];
    if (char === '-' && sql[index + 1] === '-') {
      index = advancePast(sql, index, '\n');
      continue;
    }
    if (char === '/' && sql[index + 1] === '*') {
      const close = sql.indexOf('*/', index + 2);
      if (close === -1) {
        return 'Unclosed /* comment */';
      }
      index = close + 2;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const end = skipString(sql, index, char);
      if (end === -1) {
        return `Unterminated ${char === '`' ? 'identifier' : 'string'} (${char})`;
      }
      index = end;
      continue;
    }
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth < 0) {
        return 'Unexpected )';
      }
    }
    index += 1;
  }
  if (depth > 0) {
    return `Missing ${depth} closing )`;
  }
  return null;
}

// Index just past the next `needle`, or end of string if absent.
function advancePast(sql: string, from: number, needle: string): number {
  const at = sql.indexOf(needle, from);
  return at === -1 ? sql.length : at + needle.length;
}

// Index just past the closing quote (doubled quotes are escapes), or -1 if the string never closes.
function skipString(sql: string, from: number, quote: string): number {
  let index = from + 1;
  while (index < sql.length) {
    if (sql[index] === quote) {
      if (sql[index + 1] === quote) {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  return -1;
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
  if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z' || event.key === 'y' || event.key === 'Y')) {
    // Native undo of a Format restores its "select all" checkpoint; collapse that selection so the
    // user isn't left with the whole script highlighted after Ctrl+Z.
    window.setTimeout(collapseFullSelection, 0);
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    run(event.shiftKey);
  } else if (event.altKey && event.shiftKey && event.code === 'KeyF') {
    // Grab the shortcut before VS Code's menu bar reacts to the Alt key.
    event.preventDefault();
    event.stopPropagation();
    formatEditor();
  } else if (event.key === 'Tab') {
    event.preventDefault();
    insertAtCursor('  ');
  }
}

// When the whole script ends up selected (e.g. right after undoing a Format), drop the selection
// to a caret at the end so the editor isn't left fully highlighted.
function collapseFullSelection(): void {
  if (editor.selectionStart === 0 && editor.selectionEnd === editor.value.length && editor.value.length > 0) {
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }
}

// Pretty-print the editor's SQL in the connection's dialect (whole script, or just the selection).
function formatEditor(): void {
  const options = {
    dialect: FORMATTER_DIALECTS[driverKind],
    tabWidth: 2,
    keywordCase: 'upper',
    // Keep more on each line before wrapping, so the output is compact rather than one item per line.
    expressionWidth: 120,
  } as const;
  const { selectionStart: start, selectionEnd: end } = editor;
  const hasSelection = start !== end;
  let formatted: string;
  try {
    formatted = compactSql(formatDialect(hasSelection ? editor.value.slice(start, end) : editor.value, options));
  } catch {
    // Invalid / unsupported SQL — leave the text untouched rather than corrupting it.
    return;
  }
  // Replace via execCommand so the browser records it as ONE undoable step (Ctrl+Z restores the
  // pre-format text). Assigning editor.value directly would wipe the native undo history.
  editor.focus();
  if (hasSelection) {
    editor.setSelectionRange(start, end);
  } else {
    editor.select();
  }
  const inserted = document.execCommand('insertText', false, formatted);
  if (!inserted) {
    // execCommand can be unavailable; fall back to a direct assignment (loses undo, but still formats).
    editor.value = hasSelection ? editor.value.slice(0, start) + formatted + editor.value.slice(end) : formatted;
  }
  // Collapse to a caret at the end of the inserted text — no lingering full-text selection.
  const caret = hasSelection ? start + formatted.length : editor.value.length;
  editor.setSelectionRange(caret, caret);
  scheduleSave();
  closeAutocomplete();
}

// sql-formatter always puts a clause keyword alone on its line; rejoin a lone keyword with its single
// argument (e.g. "SELECT\n  id" → "SELECT id") so simple statements aren't needlessly spread out.
// Multi-item lists (lines ending with a comma, or followed by another indented line) stay broken.
function compactSql(sql: string): string {
  const lines = sql.split('\n');
  const out: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const next = lines[index + 1];
    const after = lines[index + 2];
    const isLoneKeyword = /^[A-Z][A-Z_ ]*$/.test(line.trim());
    const nextIsIndentedItem = next !== undefined && /^\s+\S/.test(next);
    const nextIsSingleItem = nextIsIndentedItem && !next.trim().endsWith(',') && !(after !== undefined && /^\s+\S/.test(after));
    if (isLoneKeyword && nextIsSingleItem) {
      out.push(`${line} ${next.trim()}`);
      index += 1;
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}

// ---- Syntax highlighting ----

// Single-word SQL keywords coloured in the editor overlay (multi-word ones colour word by word).
const HIGHLIGHT_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'UPDATE', 'DELETE', 'SET', 'VALUES', 'CREATE',
  'ALTER', 'DROP', 'TABLE', 'VIEW', 'INDEX', 'DATABASE', 'SCHEMA', 'TRUNCATE', 'REPLACE',
  'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'JOIN', 'ON', 'USING', 'GROUP', 'BY',
  'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'LIKE',
  'BETWEEN', 'DISTINCT', 'UNION', 'ALL', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'ASC', 'DESC', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'UNIQUE', 'DEFAULT',
  'AUTO_INCREMENT', 'ADD', 'COLUMN', 'MODIFY', 'RENAME', 'TO', 'IF', 'CASCADE', 'RETURNING',
  'WITH', 'INT', 'INTEGER', 'BIGINT', 'VARCHAR', 'TEXT', 'BOOLEAN', 'BOOL', 'DATE', 'DATETIME',
  'TIMESTAMP', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'JSON', 'UUID', 'SERIAL',
]);

// Order matters: comments and strings are matched before words/numbers so their contents aren't recoloured.
const TOKEN_RE = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g;

function highlightEditor(): void {
  highlightCode.innerHTML = tokenizeSql(editor.value);
  syncHighlightScroll();
}

function syncHighlightScroll(): void {
  highlightCode.parentElement!.scrollTop = editor.scrollTop;
  highlightCode.parentElement!.scrollLeft = editor.scrollLeft;
}

function tokenizeSql(sql: string): string {
  let html = '';
  let last = 0;
  for (let match = TOKEN_RE.exec(sql); match !== null; match = TOKEN_RE.exec(sql)) {
    html += escapeHtml(sql.slice(last, match.index));
    const [text, comment, string, number, word] = match;
    if (comment !== undefined) {
      html += `<span class="tok-comment">${escapeHtml(text)}</span>`;
    } else if (string !== undefined) {
      html += `<span class="tok-string">${escapeHtml(text)}</span>`;
    } else if (number !== undefined) {
      html += `<span class="tok-number">${escapeHtml(text)}</span>`;
    } else if (word !== undefined) {
      html += highlightWord(sql, word, match.index + text.length);
    }
    last = match.index + text.length;
  }
  html += escapeHtml(sql.slice(last));
  // A trailing newline needs a filler char, else the overlay's last line collapses.
  return html.endsWith('\n') ? `${html} ` : html;
}

function highlightWord(sql: string, word: string, endIndex: number): string {
  if (HIGHLIGHT_KEYWORDS.has(word.toUpperCase())) {
    return `<span class="tok-keyword">${escapeHtml(word)}</span>`;
  }
  // A word immediately followed by '(' is a function call.
  if (sql[endIndex] === '(') {
    return `<span class="tok-function">${escapeHtml(word)}</span>`;
  }
  return escapeHtml(word);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (char) => (char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&gt;'));
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

// ---- Query history ----

function toggleHistory(): void {
  setHistoryOpen(historyPanel.hidden);
}

// The two side panels share the right edge: opening one closes the other.
function setHistoryOpen(open: boolean): void {
  historyPanel.hidden = !open;
  historyToggle.setAttribute('aria-pressed', String(open));
  historyToggle.classList.toggle('active', open);
  if (open) {
    setSnippetsOpen(false);
  }
}

// ---- Snippets ----

let snippets: Snippet[] = [];

function setSnippetsOpen(open: boolean): void {
  snippetsPanel.hidden = !open;
  snippetsToggle.setAttribute('aria-pressed', String(open));
  snippetsToggle.classList.toggle('active', open);
  if (open) {
    setHistoryOpen(false);
    snippetsFilter.focus();
  }
}

// The selection when there is one, else the whole editor.
function saveSnippet(): void {
  const selection = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  const sql = (selection.trim() !== '' ? selection : editor.value).trim();
  if (sql === '') {
    status.textContent = 'Nothing to save: the editor is empty';
    return;
  }
  api.postMessage({ type: 'saveSnippet', sql });
}

function drawSnippets(): void {
  const needle = snippetsFilter.value.trim().toLowerCase();
  const shown = needle
    ? snippets.filter((snippet) => `${snippet.name}\n${snippet.sql}`.toLowerCase().includes(needle))
    : snippets;
  snippetsList.replaceChildren(...shown.map(buildSnippetItem));
  snippetsEmpty.hidden = snippets.length > 0;
  const total = snippets.length;
  snippetsCount.textContent = total === 0 ? '' : shown.length !== total ? `(${shown.length} / ${total})` : `(${total})`;
}

function buildSnippetItem(snippet: Snippet): HTMLLIElement {
  const item = document.createElement('li');
  item.title = snippet.sql;
  item.addEventListener('click', () => applyHistory(snippet.sql));

  const head = document.createElement('div');
  head.className = 'snippet-head';
  const name = document.createElement('span');
  name.className = 'snippet-name';
  name.textContent = snippet.name;
  const rename = document.createElement('button');
  rename.className = 'snippet-action';
  rename.title = 'Rename';
  rename.textContent = '✎';
  rename.addEventListener('click', (event) => {
    event.stopPropagation();
    api.postMessage({ type: 'renameSnippet', id: snippet.id });
  });
  const remove = document.createElement('button');
  remove.className = 'snippet-action snippet-remove';
  remove.title = 'Delete';
  remove.textContent = '×';
  remove.addEventListener('click', (event) => {
    event.stopPropagation();
    api.postMessage({ type: 'deleteSnippet', id: snippet.id });
  });
  head.append(name, rename, remove);

  const sql = document.createElement('div');
  sql.className = 'history-sql';
  sql.textContent = snippet.sql;

  item.append(head, sql);
  return item;
}

function renderHistory(items: HistoryEntry[]): void {
  historyEntries = items;
  drawHistory();
}

// (Re)draw the list from historyEntries, narrowed by the free-text filter.
function drawHistory(): void {
  const entries = filteredHistory();
  historyList.replaceChildren();
  historyEmpty.hidden = historyEntries.length > 0;
  // Total when unfiltered; "shown / total" once the filter narrows the list.
  const total = historyEntries.length;
  const isFiltered = entries.length !== total;
  historyCount.textContent = total === 0 ? '' : isFiltered ? `(${entries.length} / ${total})` : `(${total})`;
  for (const entry of entries) {
    historyList.appendChild(buildHistoryItem(entry));
  }
}

function filteredHistory(): HistoryEntry[] {
  const needle = historyFilter.value.trim().toLowerCase();
  if (needle === '') {
    return historyEntries;
  }
  return historyEntries.filter((entry) => entry.sql.toLowerCase().includes(needle));
}

function buildHistoryItem(entry: HistoryEntry): HTMLLIElement {
  const item = document.createElement('li');
  item.title = entry.sql;
  item.addEventListener('click', () => applyHistory(entry.sql));

  const sql = document.createElement('div');
  sql.className = 'history-sql';
  sql.textContent = entry.sql;

  const meta = document.createElement('div');
  meta.className = 'history-meta';
  const when = document.createElement('span');
  when.textContent = formatTime(entry.at);
  const rows = document.createElement('span');
  rows.className = 'history-rows';
  rows.textContent = formatRows(entry);
  meta.append(when, rows);

  item.append(sql, meta);
  return item;
}

// Legacy entries (at === 0) predate timing, so their time is unknown.
function formatTime(at: number): string {
  if (!at) {
    return '—';
  }
  return new Date(at).toLocaleString();
}

function formatRows(entry: HistoryEntry): string {
  const duration = entry.durationMs === undefined ? '' : ` · ${formatDuration(entry.durationMs)}`;
  if (entry.affectedRows !== undefined) {
    return `${entry.affectedRows} affected${duration}`;
  }
  if (entry.rowCount !== undefined) {
    return `${entry.rowCount} returned${duration}`;
  }
  return '';
}

// "12 ms" under a second, "1.3 s" above.
function formatDuration(durationMs: number): string {
  return durationMs < 1000 ? `${durationMs} ms` : `${(durationMs / 1000).toFixed(durationMs < 10000 ? 1 : 0)} s`;
}

// Export the currently visible (filtered) history to CSV or Markdown; the host writes the file.
function exportHistory(format: 'csv' | 'markdown'): void {
  const entries = filteredHistory();
  if (entries.length === 0) {
    return;
  }
  const content = format === 'csv' ? toHistoryCsv(entries) : toHistoryMarkdown(entries);
  api.postMessage({ type: 'exportHistory', format, content, count: entries.length });
}

function toHistoryCsv(entries: HistoryEntry[]): string {
  const header = ['executed_at', 'sql', 'rows_returned', 'rows_affected'];
  const lines = entries.map((entry) =>
    [
      formatTime(entry.at),
      entry.sql,
      entry.rowCount ?? '',
      entry.affectedRows ?? '',
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toHistoryMarkdown(entries: HistoryEntry[]): string {
  const header = '| Executed at | Query | Returned | Affected |\n| --- | --- | --- | --- |';
  const rows = entries.map((entry) => {
    // Keep each query on one Markdown table row: collapse newlines and escape pipes.
    const sql = entry.sql.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');
    return `| ${formatTime(entry.at)} | \`${sql}\` | ${entry.rowCount ?? ''} | ${entry.affectedRows ?? ''} |`;
  });
  return [header, ...rows].join('\n');
}

// Replace the current selection (or insert at the caret) with the chosen past query.
// Insert at the caret (replacing the selection), on its own line when the caret sits after text.
function applyHistory(sql: string): void {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const before = editor.value.slice(0, start);
  const separator = before === '' || before.endsWith('\n') ? '' : '\n';
  const insert = `${separator}${sql}`;
  editor.value = before + insert + editor.value.slice(end);
  editor.selectionStart = editor.selectionEnd = start + insert.length;
  editor.focus();
  scheduleSave();
}

// ---- Query execution & results ----

// The selection when there is one, else the whole editor; `explain` asks for the plan instead.
function run(explain: boolean): void {
  const selection = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  const sql = selection.trim() !== '' ? selection : editor.value;
  if (sql.trim() === '') {
    return;
  }
  closeAutocomplete();
  setRunning(true);
  status.textContent = explain ? 'Explaining…' : 'Running…';
  api.postMessage({ type: 'run', sql, namespace: currentNamespace, explain });
}

// While a run is in flight the Run button gives way to Cancel.
function setRunning(running: boolean): void {
  runButton.hidden = running;
  explainButton.disabled = running;
  cancelButton.hidden = !running;
  cancelButton.disabled = false;
}

function populateSchemas(namespaces: string[], selected: string): void {
  schemaSelect.replaceChildren(...namespaces.map((name) => new Option(name, name)));
  schemaSelect.value = selected;
  currentNamespace = selected;
}

// ---- Result rendering + inline editing ----

// One tab per `;`-separated statement; the active tab is the one shown in the table.
let tabs: ConsoleResult[] = [];
let activeTab = 0;
// Pending cell edits across all tabs, keyed "tab:row:col"; values are the new cell contents.
const pendingEdits = new Map<string, string | null>();

const MIN_EDITOR_HEIGHT = 90;

// Drag the full-width bar under the editor to resize it (a clearer handle than the textarea corner grip).
function setupEditorResizer(): void {
  const resizer = byId<HTMLDivElement>('editorResizer');
  resizer.addEventListener('mousedown', (event: MouseEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = editor.offsetHeight;
    document.body.classList.add('resizing-editor');
    const onMove = (moveEvent: MouseEvent): void => {
      editor.style.height = `${Math.max(MIN_EDITOR_HEIGHT, startHeight + moveEvent.clientY - startY)}px`;
    };
    const onUp = (): void => {
      document.body.classList.remove('resizing-editor');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function setResultFooter(text: string): void {
  resultFooter.textContent = text;
  resultFooter.hidden = text === '';
}

function renderResults(results: ConsoleResult[]): void {
  setRunning(false);
  pendingEdits.clear();
  refreshEditBar();
  status.textContent = '';
  tabs = results.length > 0 ? results : [{ label: '', columns: [], rows: [], durationMs: 0 }];
  activeTab = 0;
  renderTabBar();
  renderActiveResult();
}

// A tab strip appears only when a script produced more than one result.
function renderTabBar(): void {
  resultTabs.replaceChildren();
  resultTabs.hidden = tabs.length <= 1;
  if (tabs.length <= 1) {
    return;
  }
  tabs.forEach((tab, index) => {
    const button = document.createElement('button');
    button.className = 'result-tab';
    button.classList.toggle('active', index === activeTab);
    button.classList.toggle('error', !!tab.error);
    button.textContent = `${index + 1}. ${tab.error ? '⚠ ' : ''}${tab.label}`;
    button.title = `${tab.label}\n${formatDuration(tab.durationMs)}`;
    button.addEventListener('click', () => {
      activeTab = index;
      renderTabBar();
      renderActiveResult();
    });
    resultTabs.appendChild(button);
  });
}

function renderActiveResult(): void {
  const tab = tabs[activeTab];
  resultTable.classList.remove('error-view');
  resultTable.textContent = '';
  if (tab.error) {
    setResultFooter('');
    resultTable.classList.add('error-view');
    resultTable.textContent = tab.error;
    return;
  }
  if (tab.columns.length === 0) {
    setResultFooter(`Query OK · ${tab.affectedRows ?? 0} row(s) affected · ${formatDuration(tab.durationMs)}`);
    resultTable.replaceChildren();
    return;
  }
  setResultFooter(`${tab.rows.length} row(s) · ${formatDuration(tab.durationMs)}`);
  const meta = tab.columnsMeta ?? [];

  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  tab.columns.forEach((column, index) => {
    const th = document.createElement('th');
    th.textContent = column;
    if (meta[index]?.editable) {
      th.classList.add('editable');
      th.title = 'Editable — double-click a cell';
    }
    headRow.appendChild(th);
  });
  head.appendChild(headRow);

  const bodyEl = document.createElement('tbody');
  tab.rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    row.forEach((cell, colIndex) => {
      tr.appendChild(buildResultCell(rowIndex, colIndex, cell));
    });
    bodyEl.appendChild(tr);
  });
  resultTable.replaceChildren(head, bodyEl);
}

function buildResultCell(rowIndex: number, colIndex: number, baseValue: string | null): HTMLTableCellElement {
  const td = document.createElement('td');
  const key = editKey(rowIndex, colIndex);
  const edited = pendingEdits.has(key);
  paintResultCell(td, edited ? pendingEdits.get(key)! : baseValue);
  td.classList.toggle('dirty', edited);
  if (tabs[activeTab].columnsMeta?.[colIndex]?.editable) {
    td.classList.add('editable');
    td.addEventListener('dblclick', () => beginCellEdit(td, rowIndex, colIndex));
  }
  return td;
}

function editKey(rowIndex: number, colIndex: number): string {
  return `${activeTab}:${rowIndex}:${colIndex}`;
}

function parseEditKey(key: string): { tabIndex: number; rowIndex: number; colIndex: number } {
  const [tabIndex, rowIndex, colIndex] = key.split(':').map(Number);
  return { tabIndex, rowIndex, colIndex };
}

function paintResultCell(td: HTMLTableCellElement, value: string | null): void {
  td.classList.toggle('null', value === null);
  td.textContent = value === null ? 'NULL' : value;
}

// Double-click → inline input; Enter/blur commits, Escape cancels. A changed value becomes a pending edit.
function beginCellEdit(td: HTMLTableCellElement, rowIndex: number, colIndex: number): void {
  if (td.querySelector('input')) {
    return;
  }
  const key = editKey(rowIndex, colIndex);
  const base = tabs[activeTab].rows[rowIndex][colIndex];
  const current = pendingEdits.has(key) ? pendingEdits.get(key)! : base;
  const input = document.createElement('input');
  input.className = 'cell-edit';
  input.value = current ?? '';
  const finish = (commit: boolean): void => {
    if (commit) {
      setCellEdit(td, rowIndex, colIndex, input.value);
    } else {
      td.classList.toggle('dirty', pendingEdits.has(key));
      paintResultCell(td, pendingEdits.has(key) ? pendingEdits.get(key)! : base);
    }
  };
  const onBlur = (): void => finish(true);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      input.removeEventListener('blur', onBlur);
      finish(false);
    }
  });
  input.addEventListener('blur', onBlur);
  td.replaceChildren(input);
  input.focus();
  input.select();
}

function setCellEdit(td: HTMLTableCellElement, rowIndex: number, colIndex: number, value: string): void {
  const key = editKey(rowIndex, colIndex);
  const original = tabs[activeTab].rows[rowIndex][colIndex];
  if (value === (original ?? '')) {
    pendingEdits.delete(key);
    td.classList.remove('dirty');
    paintResultCell(td, original);
  } else {
    pendingEdits.set(key, value);
    td.classList.add('dirty');
    paintResultCell(td, value);
  }
  refreshEditBar();
}

function refreshEditBar(): void {
  const count = pendingEdits.size;
  editBar.hidden = count === 0;
  editCount.textContent = `${count} pending change${count === 1 ? '' : 's'}`;
  if (count === 0) {
    editSql.hidden = true;
    editSqlToggle.setAttribute('aria-pressed', 'false');
  }
  renderPendingSql();
}

function togglePendingSql(): void {
  const willShow = editSql.hidden;
  editSql.hidden = !willShow;
  editSqlToggle.setAttribute('aria-pressed', String(willShow));
  editSqlToggle.textContent = willShow ? 'Hide SQL' : 'Show SQL';
  renderPendingSql();
}

// The exact UPDATE statements Commit will run, mirroring the grid's "pending changes" preview.
function renderPendingSql(): void {
  if (editSql.hidden) {
    return;
  }
  editSql.textContent = buildEditPayload().map(pendingEditToSql).join('\n');
}

function pendingEditToSql(edit: ConsoleCellEdit): string {
  const where = edit.pk.map((part) => `${part.column} = ${sqlLiteral(part.value)}`).join(' AND ');
  return `UPDATE ${edit.table} SET ${edit.column} = ${sqlLiteral(edit.value)} WHERE ${where};`;
}

// Display-only literal (the real statement is parameterized host-side): NULL, or single-quoted + escaped.
function sqlLiteral(value: string | null): string {
  return value === null ? 'NULL' : `'${value.replace(/'/g, "''")}'`;
}

function revertEdits(): void {
  pendingEdits.clear();
  refreshEditBar();
  renderActiveResult();
}

function commitEdits(): void {
  const edits = buildEditPayload();
  if (edits.length === 0) {
    return;
  }
  editCommit.disabled = true;
  api.postMessage({ type: 'updateCells', namespace: currentNamespace, edits });
}

// Turn pending cell changes into UPDATE payloads, reading each edit's tab + row PK from the result.
function buildEditPayload(): ConsoleCellEdit[] {
  const edits: ConsoleCellEdit[] = [];
  for (const [key, value] of pendingEdits) {
    const { tabIndex, rowIndex, colIndex } = parseEditKey(key);
    const tab = tabs[tabIndex];
    const meta = tab?.columnsMeta?.[colIndex];
    if (!meta?.editable || !meta.sourceTable || !meta.sourceColumn) {
      continue;
    }
    const table = tab.editableTables?.find((entry) => entry.table === meta.sourceTable);
    if (!table) {
      continue;
    }
    const pk = table.pkColumns.map((column, index) => ({
      column,
      value: tab.rows[rowIndex][table.pkIndexes[index]],
    }));
    edits.push({ table: meta.sourceTable, column: meta.sourceColumn, value, pk });
  }
  return edits;
}

function onUpdateResult(count: number, error?: string): void {
  editCommit.disabled = false;
  if (error) {
    status.textContent = `Update failed: ${error}`;
    return;
  }
  // Success: the edited values are now the source of truth, so bake them into each tab's baseline.
  for (const [key, value] of pendingEdits) {
    const { tabIndex, rowIndex, colIndex } = parseEditKey(key);
    if (tabs[tabIndex]) {
      tabs[tabIndex].rows[rowIndex][colIndex] = value;
    }
  }
  pendingEdits.clear();
  refreshEditBar();
  renderActiveResult();
  status.textContent = `${count} cell${count === 1 ? '' : 's'} updated`;
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
