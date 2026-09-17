import type { ColumnMeta, IndexMeta } from './types';

// How many FK options to load per request (client shows them, server-side search narrows further).
export const FK_LIMIT = 50;

// Text-ish column types worth showing as a foreign-key row's human label.
const TEXT_TYPE_RE = /char|text|varchar|string|enum/i;
// Preferred descriptive column names, best first.
const LABEL_NAMES = ['name', 'code', 'label', 'title', 'slug', 'reference', 'email', 'username', 'display_name'];

// A UUID/identifier column makes a useless label (it repeats or is opaque): char(36)/varchar(36),
// or a name that is clearly an id.
function isIdentifierColumn(column: ColumnMeta): boolean {
  return /36|uuid|uniqueidentifier/i.test(column.type) || /(^|_)id$|^uuid$/i.test(column.name);
}

// Pick the column that best describes a referenced row, in the user's priority order:
// name → code → label → other UNIQUE text column → other text column → none. UUID/id columns are
// never used as a label (they repeat or are opaque); then the dropdown shows just the key.
export function pickDisplayColumn(columns: ColumnMeta[], indexes: IndexMeta[], refColumn: string): string | null {
  const textColumns = columns.filter((column) => column.name !== refColumn && TEXT_TYPE_RE.test(column.type));
  const named = LABEL_NAMES.map((name) => textColumns.find((column) => column.name.toLowerCase() === name)).find(Boolean);
  if (named) {
    return named.name;
  }
  // Fallbacks must be descriptive, so drop UUID/id-shaped columns entirely.
  const descriptive = textColumns.filter((column) => !isIdentifierColumn(column));
  const uniqueColumns = new Set(
    indexes.filter((index) => index.isUnique && index.columns.length === 1).map((index) => index.columns[0]),
  );
  const uniqueText = descriptive.find((column) => uniqueColumns.has(column.name));
  return (uniqueText ?? descriptive[0])?.name ?? null;
}
