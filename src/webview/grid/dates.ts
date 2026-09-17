import type { ColumnMeta } from '../../domain/types';
import type { CellValue } from './rowModel';

export type DateInputType = 'date' | 'datetime-local';

// Raw 'YYYY-MM-DD[ HH:MM:SS]' → the value a <input type=date|datetime-local> expects.
export function toDateInputValue(value: CellValue, dateType: DateInputType): string {
  if (value === null) {
    return '';
  }
  if (dateType === 'date') {
    return value.slice(0, 10);
  }
  return value.replace('T', ' ').slice(0, 19).replace(' ', 'T');
}

// Native date field value → the raw 'YYYY-MM-DD[ HH:MM:SS]' stored for the UPDATE.
export function fromDateInputValue(inputValue: string, column: ColumnMeta, dateType: DateInputType): CellValue {
  if (inputValue === '') {
    return column.isNullable ? null : '';
  }
  return dateType === 'date' ? inputValue : inputValue.replace('T', ' ');
}

// Display a raw 'YYYY-MM-DD[ HH:MM:SS]' value using the configured locale (empty = raw ISO).
export function formatDate(value: CellValue, locale: string): string {
  if (value === null) {
    return '';
  }
  if (!locale) {
    return value;
  }
  const hasTime = value.length > 10;
  const parsed = new Date(hasTime ? value.replace(' ', 'T') : `${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return hasTime ? parsed.toLocaleString(locale) : parsed.toLocaleDateString(locale);
}
