export interface SortClause {
  column: string;
  direction: 'ASC' | 'DESC';
}

// `\`name\` DESC` / `"name" asc` → its parts; null for anything more complex (expressions, lists).
export function parseOrder(clause: string): SortClause | null {
  const match = /^["'`[\]]*([\w$]+)["'`[\]]*\s+(ASC|DESC)$/i.exec(clause.trim());
  if (!match) {
    return null;
  }
  return { column: match[1], direction: match[2].toUpperCase() as 'ASC' | 'DESC' };
}
