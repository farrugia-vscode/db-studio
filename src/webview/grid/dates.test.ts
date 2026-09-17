import { describe, expect, test } from 'bun:test';
import { formatDate, fromDateInputValue, toDateInputValue } from './dates';
import { column } from '../../test/fixtures';

describe('date input round trip', () => {
  test('raw value → native input value', () => {
    expect(toDateInputValue('2026-09-17 14:35:36', 'datetime-local')).toBe('2026-09-17T14:35:36');
    expect(toDateInputValue('2026-09-17T14:35:36.000Z', 'datetime-local')).toBe('2026-09-17T14:35:36');
    expect(toDateInputValue('2026-09-17 14:35:36', 'date')).toBe('2026-09-17');
    expect(toDateInputValue(null, 'date')).toBe('');
  });

  test('native input value → raw value, empty follows nullability', () => {
    expect(fromDateInputValue('2026-09-17T14:35', column('at', 'datetime'), 'datetime-local')).toBe('2026-09-17 14:35');
    expect(fromDateInputValue('', column('at', 'datetime'), 'datetime-local')).toBeNull();
    expect(fromDateInputValue('', column('at', 'datetime', { isNullable: false }), 'date')).toBe('');
  });
});

describe('formatDate', () => {
  test('returns the raw value without a locale or when unparsable', () => {
    expect(formatDate('2026-09-17', '')).toBe('2026-09-17');
    expect(formatDate('not a date', 'fr-FR')).toBe('not a date');
    expect(formatDate(null, 'fr-FR')).toBe('');
  });

  test('formats with the locale', () => {
    expect(formatDate('2026-09-17', 'fr-FR')).toBe('17/09/2026');
  });
});
