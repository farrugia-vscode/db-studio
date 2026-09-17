import type { CellValue } from './rowModel';

export const NULL_LABEL = '<null>';

// Null needs a sentinel so it survives the checkbox's string value round-trip.
export function encodeValue(value: CellValue): string {
  return value === null ? '\0null' : `s${value}`;
}

export function decodeValue(encoded: string): CellValue {
  return encoded === '\0null' ? null : encoded.slice(1);
}

export function displayValue(value: CellValue): string {
  return value === null ? NULL_LABEL : value;
}
