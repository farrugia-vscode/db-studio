import type { ForeignKeyDraft, IndexDraft } from './types';

/** Index drafts that are kept and complete enough to emit. */
export function activeIndexes(indexes: IndexDraft[]): IndexDraft[] {
  return indexes.filter((index) => !index.drop && index.name.trim() !== '' && index.columns.length > 0);
}

export function isCompleteForeignKey(fk: ForeignKeyDraft): boolean {
  return fk.name.trim() !== '' && fk.columns.length > 0 && fk.refTable.trim() !== '' && fk.refColumns.length > 0;
}

export function activeForeignKeys(fks: ForeignKeyDraft[]): ForeignKeyDraft[] {
  return fks.filter((fk) => !fk.drop && isCompleteForeignKey(fk));
}
