import { describe, expect, test } from 'bun:test';
import { computeEdits, defaultForNewRow, hasLocalChanges, toCellRow, type RowModel } from './rowModel';
import { column } from '../../test/fixtures';

const columns = [column('id', 'int', { isPrimaryKey: true }), column('name', 'varchar(20)'), column('note', 'text')];
const pk = ['id'];

function loaded(values: Record<string, string | null>): RowModel {
  return { values: { ...values }, original: { ...values }, deleted: false };
}

describe('computeEdits', () => {
  test('emits nothing for untouched rows', () => {
    expect(computeEdits([loaded({ id: '1', name: 'a', note: null })], columns, pk)).toEqual([]);
  });

  test('emits an update with only the changed cells, keyed by the original pk', () => {
    const row = loaded({ id: '1', name: 'a', note: null });
    row.values.name = 'b';
    row.values.id = '9';
    expect(computeEdits([row], columns, pk)).toEqual([{ op: 'update', pk: { id: '1' }, set: { id: '9', name: 'b' } }]);
  });

  test('emits a delete by pk, and inserts without the null cells', () => {
    const gone = loaded({ id: '2', name: 'x', note: null });
    gone.deleted = true;
    const fresh: RowModel = { values: { id: null, name: 'new', note: null }, original: null, deleted: false };
    expect(computeEdits([gone, fresh], columns, pk)).toEqual([
      { op: 'delete', pk: { id: '2' } },
      { op: 'insert', values: { name: 'new' } },
    ]);
  });

  test('skips a new row that was dropped or left empty', () => {
    const dropped: RowModel = { values: { id: null, name: 'x', note: null }, original: null, deleted: true };
    const empty: RowModel = { values: { id: null, name: null, note: null }, original: null, deleted: false };
    expect(computeEdits([dropped, empty], columns, pk)).toEqual([]);
  });
});

describe('hasLocalChanges', () => {
  test('is true for any edit, insert or deletion', () => {
    const row = loaded({ id: '1', name: 'a', note: null });
    expect(hasLocalChanges([row], columns)).toBe(false);
    row.values.note = '';
    expect(hasLocalChanges([row], columns)).toBe(true);
  });
});

describe('defaultForNewRow', () => {
  test('pre-selects the enum default, else its first value, else null', () => {
    expect(defaultForNewRow(column('status', "enum('draft','live')", { defaultValue: 'live' }))).toBe('live');
    expect(defaultForNewRow(column('status', "enum('draft','live')", { defaultValue: 'gone' }))).toBe('draft');
    expect(defaultForNewRow(column('name', 'varchar(20)', { defaultValue: 'x' }))).toBeNull();
  });
});

describe('toCellRow', () => {
  test('stringifies every value and keeps null/undefined as null', () => {
    expect(toCellRow({ id: 1, name: 'a', gone: undefined, none: null })).toEqual({ id: '1', name: 'a', gone: null, none: null });
  });
});
