// Compact label for a statistics-based row count: "1.2k rows", "3.4M rows", "42 rows".
export function formatRowCount(count: number): string {
  if (count >= 1_000_000) {
    return `${trimZero((count / 1_000_000).toFixed(1))}M rows`;
  }
  if (count >= 1_000) {
    return `${trimZero((count / 1_000).toFixed(1))}k rows`;
  }
  return `${count} ${count === 1 ? 'row' : 'rows'}`;
}

function trimZero(text: string): string {
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}
