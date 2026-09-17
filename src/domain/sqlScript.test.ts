import { describe, expect, test } from 'bun:test';
import { isReadStatement, splitSqlStatements, statementLabel } from './sqlScript';

describe('splitSqlStatements', () => {
  test('splits on top-level semicolons and drops empty statements', () => {
    expect(splitSqlStatements('SELECT 1; SELECT 2;;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  test('keeps a trailing statement without a semicolon', () => {
    expect(splitSqlStatements('SELECT 1;\nSELECT 2')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  test('ignores semicolons inside strings and comments', () => {
    const sql = "SELECT 'a;b'; -- c;d\nSELECT /* e;f */ `g;h`; SELECT 3";
    expect(splitSqlStatements(sql)).toEqual(["SELECT 'a;b'", '-- c;d\nSELECT /* e;f */ `g;h`', 'SELECT 3']);
  });

  test('returns the whole script when there is no semicolon', () => {
    expect(splitSqlStatements('  SELECT 1  ')).toEqual(['SELECT 1']);
  });
});

describe('isReadStatement', () => {
  test('accepts read keywords regardless of case and leading comments', () => {
    expect(isReadStatement('select 1')).toBe(true);
    expect(isReadStatement('-- note\n/* block */ WITH x AS (SELECT 1) SELECT * FROM x')).toBe(true);
    expect(isReadStatement('EXPLAIN SELECT 1')).toBe(true);
  });

  test('treats anything else as a write', () => {
    expect(isReadStatement('UPDATE t SET a = 1')).toBe(false);
    expect(isReadStatement('CALL do_things()')).toBe(false);
    expect(isReadStatement('')).toBe(false);
  });
});

describe('statementLabel', () => {
  test('collapses whitespace and truncates long statements', () => {
    expect(statementLabel('SELECT *\n  FROM  users')).toBe('SELECT * FROM users');
    const long = `SELECT ${'a, '.repeat(20)}b FROM t`;
    expect(statementLabel(long)).toHaveLength(41);
    expect(statementLabel(long).endsWith('…')).toBe(true);
  });
});
