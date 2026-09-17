import type { ColumnMeta } from '../../domain/types';
import { type ValueEditor } from './columnTypes';
import { element } from './dom';
import { compactJson, jsonEnterEdit, prettyJson, tidyJson } from './json';
import type { CellValue } from './rowModel';

// One modal for every multi-line value; `editor` switches it between JSON (validated, formatted,
// Enter-assisted) and plain text (saved verbatim). The caller decides what to do with the value.
const modal = element<HTMLDivElement>('valueModal');
const title = element<HTMLSpanElement>('valueModalTitle');
const subtitle = element<HTMLSpanElement>('valueModalColumn');
const textarea = element<HTMLTextAreaElement>('valueModalText');
const status = element<HTMLSpanElement>('valueStatus');
const saveButton = element<HTMLButtonElement>('valueModalSave');
const cancelButton = element<HTMLButtonElement>('valueModalCancel');
const formatButton = element<HTMLButtonElement>('jsonFormat');

interface ValueTarget {
  editor: ValueEditor;
  column: ColumnMeta;
  onSave: (next: CellValue) => void;
}

let target: ValueTarget | null = null;

saveButton.addEventListener('click', saveValueModal);
cancelButton.addEventListener('click', closeValueModal);
formatButton.addEventListener('click', formatJsonModal);
textarea.addEventListener('input', validateValueModal);
modal.addEventListener('keydown', onValueModalKeydown);

// A typed `seed` (Excel-style "type over the cell") replaces the current value in the editor.
export function openValueModal(
  editor: ValueEditor,
  column: ColumnMeta,
  value: CellValue,
  seed: string | null,
  onSave: (next: CellValue) => void,
): void {
  target = { editor, column, onSave };
  title.textContent = editor === 'json' ? 'Edit JSON' : 'Edit text';
  subtitle.textContent = `${column.name} · ${column.type}`;
  formatButton.hidden = editor !== 'json';
  textarea.value = seed ?? (editor === 'json' ? prettyJson(value) : (value ?? ''));
  modal.hidden = false;
  validateValueModal();
  textarea.focus();
  if (seed !== null) {
    textarea.setSelectionRange(seed.length, seed.length);
  }
}

// Escape cancels, Ctrl/Cmd+Enter saves. In JSON mode a bare Enter is assisted (scaffolding);
// every other key types literally — nothing else is intercepted.
function onValueModalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeValueModal();
    return;
  }
  if (event.key !== 'Enter') {
    return;
  }
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    saveValueModal();
    return;
  }
  if (target?.editor === 'json' && event.target === textarea) {
    event.preventDefault();
    smartJsonEnter();
  }
}

function formatJsonModal(): void {
  textarea.value = tidyJson(textarea.value);
  validateJsonModal();
  textarea.focus();
}

function smartJsonEnter(): void {
  const { insert, caret } = jsonEnterEdit(textarea.value, textarea.selectionStart);
  const value = textarea.value;
  textarea.value = value.slice(0, textarea.selectionStart) + insert + value.slice(textarea.selectionEnd);
  textarea.selectionStart = textarea.selectionEnd = caret;
  validateJsonModal();
}

function validateValueModal(): boolean {
  return target?.editor === 'json' ? validateJsonModal() : validateTextModal();
}

// Live validity: colors the status and disables Save on invalid JSON (typing stays free — only
// the Save button is gated, never the textarea).
function validateJsonModal(): boolean {
  const text = textarea.value.trim();
  if (text === '') {
    setStatus(emptyStatus(), 'muted');
    saveButton.disabled = false;
    return true;
  }
  try {
    JSON.parse(text);
    setStatus('Valid JSON', 'ok');
    saveButton.disabled = false;
    return true;
  } catch (error) {
    setStatus((error as Error).message, 'error');
    saveButton.disabled = true;
    return false;
  }
}

// Plain text is always saveable; the status just describes what will be stored.
function validateTextModal(): boolean {
  const text = textarea.value;
  if (text === '') {
    setStatus(emptyStatus(), 'muted');
  } else {
    const lineCount = text.split('\n').length;
    setStatus(`${text.length} chars · ${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`, 'muted');
  }
  saveButton.disabled = false;
  return true;
}

function emptyStatus(): string {
  return target?.column.isNullable ? 'empty → NULL' : 'empty';
}

function setStatus(text: string, tone: 'muted' | 'ok' | 'error'): void {
  status.textContent = text;
  status.className = `value-status ${tone}`;
}

function saveValueModal(): void {
  // Never persist invalid JSON (backs up the disabled Save button).
  if (!target || !validateValueModal()) {
    return;
  }
  const { editor, column, onSave } = target;
  onSave(editor === 'json' ? jsonValueToStore(column) : textValueToStore(column));
  closeValueModal();
}

// JSON is stored compact; an empty editor stores NULL when the column allows it.
function jsonValueToStore(column: ColumnMeta): CellValue {
  const text = textarea.value.trim();
  if (text === '') {
    return column.isNullable ? null : '';
  }
  return compactJson(text);
}

// Text is stored verbatim (whitespace and newlines included); empty follows the same NULL rule.
function textValueToStore(column: ColumnMeta): CellValue {
  const text = textarea.value;
  if (text === '') {
    return column.isNullable ? null : '';
  }
  return text;
}

function closeValueModal(): void {
  modal.hidden = true;
  target = null;
}
