import { describe, expect, test } from 'bun:test';
import { pickDisplayColumn } from './fkDisplayColumn';
import { column, uniqueIndex } from '../test/fixtures';

const id = column('id', 'int unsigned', { isPrimaryKey: true, isNullable: false });

describe('pickDisplayColumn', () => {
  test('prefers the well-known descriptive names in order', () => {
    const columns = [id, column('slug', 'varchar(255)'), column('code', 'varchar(20)'), column('name', 'varchar(255)')];
    expect(pickDisplayColumn(columns, [], 'id')).toBe('name');
    expect(pickDisplayColumn(columns.filter((c) => c.name !== 'name'), [], 'id')).toBe('code');
  });

  test('falls back to a unique text column, then any text column', () => {
    const columns = [id, column('comment', 'text'), column('sku', 'varchar(64)')];
    expect(pickDisplayColumn(columns, [uniqueIndex('sku_unique', ['sku'])], 'id')).toBe('sku');
    expect(pickDisplayColumn(columns, [], 'id')).toBe('comment');
  });

  test('never labels with the key itself, a uuid or an id-shaped column', () => {
    const columns = [column('uuid', 'char(36)', { isPrimaryKey: true }), column('owner_id', 'varchar(64)'), column('token', 'varchar(36)')];
    expect(pickDisplayColumn(columns, [], 'uuid')).toBeNull();
  });

  test('ignores non-text columns', () => {
    expect(pickDisplayColumn([id, column('amount', 'decimal(10,2)'), column('created_at', 'datetime')], [], 'id')).toBeNull();
  });
});
