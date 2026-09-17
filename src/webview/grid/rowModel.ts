import type { EditDto } from '../../domain/edits/edit';
import type { ColumnMeta, Row } from '../../domain/types';
import { enumValues } from './columnTypes';

export type CellValue = string | null;

/** `original === null` marks a row inserted in the grid, not yet persisted. */
export interface RowModel {
  values: Record<string, CellValue>;
  original: Record<string, CellValue> | null;
  deleted: boolean;
}

/** A cell address: row index into the models, column index into the rendered columns. */
export interface GridCell {
  r: number;
  c: number;
}

export function toCellRow(row: Row): Record<string, CellValue> {
  const cells: Record<string, CellValue> = {};
  for (const key of Object.keys(row)) {
    const value = row[key];
    cells[key] = value === null || value === undefined ? null : String(value);
  }
  return cells;
}

export function cloneModels(models: RowModel[]): RowModel[] {
  return models.map((model) => ({
    values: { ...model.values },
    original: model.original ? { ...model.original } : null,
    deleted: model.deleted,
  }));
}

// A new row starts empty (NULL), except enums: pre-select the column's default value, or the
// first enum value, so the cell shows a valid choice rather than NULL.
export function defaultForNewRow(column: ColumnMeta): CellValue {
  const options = enumValues(column.type);
  if (options && options.length > 0) {
    return column.defaultValue !== null && options.includes(column.defaultValue) ? column.defaultValue : options[0];
  }
  return null;
}

/** The pending edits as the host applies them: inserts, deletes by pk, updates of changed cells. */
export function computeEdits(models: RowModel[], columns: ColumnMeta[], pkColumns: string[]): EditDto[] {
  const edits: EditDto[] = [];
  for (const model of models) {
    if (model.original === null) {
      appendInsert(edits, model, columns);
    } else if (model.deleted) {
      edits.push({ op: 'delete', pk: pick(model.original, pkColumns) });
    } else {
      appendUpdate(edits, model, model.original, columns, pkColumns);
    }
  }
  return edits;
}

function appendInsert(edits: EditDto[], model: RowModel, columns: ColumnMeta[]): void {
  if (model.deleted) {
    return;
  }
  const values: Row = {};
  for (const column of columns) {
    if (model.values[column.name] !== null) {
      values[column.name] = model.values[column.name];
    }
  }
  if (Object.keys(values).length > 0) {
    edits.push({ op: 'insert', values });
  }
}

function appendUpdate(
  edits: EditDto[],
  model: RowModel,
  original: Record<string, CellValue>,
  columns: ColumnMeta[],
  pkColumns: string[],
): void {
  const set: Row = {};
  for (const column of columns) {
    if (model.values[column.name] !== original[column.name]) {
      set[column.name] = model.values[column.name];
    }
  }
  if (Object.keys(set).length > 0) {
    edits.push({ op: 'update', pk: pick(original, pkColumns), set });
  }
}

/** True when any row differs from what was loaded, even if it nets out to no SQL (e.g. NULL → ''). */
export function hasLocalChanges(models: RowModel[], columns: ColumnMeta[]): boolean {
  return models.some((model) => {
    if (model.original === null || model.deleted) {
      return true;
    }
    const original = model.original;
    return columns.some((column) => model.values[column.name] !== original[column.name]);
  });
}

function pick(row: Record<string, CellValue>, keys: string[]): Row {
  const picked: Row = {};
  for (const key of keys) {
    picked[key] = row[key];
  }
  return picked;
}
