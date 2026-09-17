import type { DriverKind } from './types';

// Split a script into individual statements on top-level `;`, ignoring `;` inside strings/comments.
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let index = 0;
  while (index < sql.length) {
    const char = sql[index];
    if (char === '-' && sql[index + 1] === '-') {
      const newline = sql.indexOf('\n', index);
      index = newline === -1 ? sql.length : newline;
      continue;
    }
    if (char === '/' && sql[index + 1] === '*') {
      const close = sql.indexOf('*/', index + 2);
      index = close === -1 ? sql.length : close + 2;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      index += 1;
      while (index < sql.length && sql[index] !== char) {
        index += 1;
      }
      index += 1;
      continue;
    }
    if (char === ';') {
      const statement = sql.slice(start, index).trim();
      if (statement !== '') {
        statements.push(statement);
      }
      start = index + 1;
    }
    index += 1;
  }
  const tail = sql.slice(start).trim();
  if (tail !== '') {
    statements.push(tail);
  }
  return statements.length > 0 ? statements : [sql.trim()];
}

// Leading keywords that only read data — everything else is treated as a write and blocked on
// read-only connections. A whitelist (not a blocklist) so unknown/vendor statements stay blocked.
const READ_ONLY_KEYWORDS = new Set(['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN', 'TABLE', 'VALUES', 'USE']);

export function isReadStatement(statement: string): boolean {
  // Skip leading line/block comments so the real first keyword is found.
  const withoutComments = statement.replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)+/, '');
  const keyword = /^(\w+)/.exec(withoutComments)?.[1]?.toUpperCase();
  return keyword !== undefined && READ_ONLY_KEYWORDS.has(keyword);
}

// A one-line snippet of a statement for its result tab.
export function statementLabel(statement: string): string {
  const oneLine = statement.replace(/\s+/g, ' ').trim();
  return oneLine.length > 40 ? `${oneLine.slice(0, 40)}…` : oneLine;
}

// The engine's plan statement for `statement`: SQLite spells it EXPLAIN QUERY PLAN.
export function explainStatement(statement: string, driver: DriverKind): string {
  const keyword = driver === 'sqlite' ? 'EXPLAIN QUERY PLAN' : 'EXPLAIN';
  return `${keyword} ${statement}`;
}
