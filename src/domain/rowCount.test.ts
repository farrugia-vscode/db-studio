import { describe, expect, test } from 'bun:test';
import { formatRowCount } from './rowCount';

describe('formatRowCount', () => {
  test('keeps small counts exact and abbreviates thousands and millions', () => {
    expect(formatRowCount(0)).toBe('0 rows');
    expect(formatRowCount(1)).toBe('1 row');
    expect(formatRowCount(999)).toBe('999 rows');
    expect(formatRowCount(1000)).toBe('1k rows');
    expect(formatRowCount(1234)).toBe('1.2k rows');
    expect(formatRowCount(2_500_000)).toBe('2.5M rows');
  });
});
