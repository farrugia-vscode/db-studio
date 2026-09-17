import { describe, expect, test } from 'bun:test';
import { parseOrder } from './orderBy';

describe('parseOrder', () => {
  test('reads a quoted or bare column with its direction', () => {
    expect(parseOrder('`created_at` DESC')).toEqual({ column: 'created_at', direction: 'DESC' });
    expect(parseOrder('"name" asc')).toEqual({ column: 'name', direction: 'ASC' });
    expect(parseOrder('  id ASC ')).toEqual({ column: 'id', direction: 'ASC' });
  });

  test('is null for expressions or several columns', () => {
    expect(parseOrder('a ASC, b DESC')).toBeNull();
    expect(parseOrder('LOWER(name) ASC')).toBeNull();
    expect(parseOrder('')).toBeNull();
  });
});
