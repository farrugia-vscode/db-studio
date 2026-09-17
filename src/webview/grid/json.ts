export function prettyJson(value: string | null): string {
  if (value === null) {
    return '';
  }
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

// Valid JSON is stored compact; anything else is saved verbatim (never blocks the save).
export function compactJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

// Pretty-print after tidying common slips (trailing commas); unparsable text comes back untouched.
export function tidyJson(text: string): string {
  const tidied = text.replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.stringify(JSON.parse(tidied), null, 2);
  } catch {
    return text;
  }
}

// The bracket enclosing `pos` ('{' object, '[' array, null at top level), ignoring string contents.
export function enclosingBracket(value: string, pos: number): '{' | '[' | null {
  const stack: Array<'{' | '['> = [];
  let inString = false;
  for (let i = 0; i < pos; i += 1) {
    const char = value[i];
    if (inString) {
      if (char === '\\') {
        i += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{' || char === '[') {
      stack.push(char);
    } else if (char === '}' || char === ']') {
      stack.pop();
    }
  }
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

export interface TextInsertion {
  /** Text to put in place of the selection. */
  insert: string;
  /** Caret position after the insertion, absolute in the resulting text. */
  caret: number;
}

// Enter assistance at `start`: opening a { or [ drops its closer on the line below and puts the
// caret inside (between "" for an object); otherwise a separating comma is added and, inside an
// object, the next key is scaffolded.
export function jsonEnterEdit(value: string, start: number): TextInsertion {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const indent = /^[ \t]*/.exec(value.slice(lineStart, start))?.[0] ?? '';
  const innerIndent = `${indent}  `;
  const prev = value[start - 1];
  const closerAfter = value[start] === '}' || value[start] === ']';

  if (prev === '{' || prev === '[') {
    const isObject = prev === '{';
    const keyPart = isObject ? '"": ' : '';
    // Move an existing closer to its own line, or add the matching one when it's missing.
    const tail = closerAfter ? `\n${indent}` : `\n${indent}${isObject ? '}' : ']'}`;
    return {
      insert: `\n${innerIndent}${keyPart}${tail}`,
      caret: start + 1 + innerIndent.length + (isObject ? 1 : 0),
    };
  }

  const lineBefore = value.slice(lineStart, start).trimEnd();
  const needsComma = lineBefore !== '' && !',:{[('.includes(lineBefore.slice(-1));
  const comma = needsComma ? ',' : '';
  if (enclosingBracket(value, start) === '{') {
    return { insert: `${comma}\n${indent}"": `, caret: start + comma.length + 1 + indent.length + 1 };
  }
  const insert = `${comma}\n${indent}`;
  return { insert, caret: start + insert.length };
}
