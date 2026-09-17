import type { ColumnMeta, IndexMeta } from '../domain/types';

/** A column as the drivers describe it; only the fields under test vary. */
export function column(name: string, type: string, overrides: Partial<ColumnMeta> = {}): ColumnMeta {
  return {
    name,
    type,
    isNullable: true,
    isPrimaryKey: false,
    isAutoIncrement: false,
    defaultValue: null,
    ...overrides,
  };
}

export function uniqueIndex(name: string, columns: string[]): IndexMeta {
  return { name, isUnique: true, columns };
}
