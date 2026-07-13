/** Black or white — whichever reads better on top of an arbitrary hex color. */
export function titleForeground(hex: string): string {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) {
    return '#ffffff';
  }
  const value = parseInt(match[1], 16);
  const luminance = (0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)) / 255;
  return luminance > 0.6 ? '#1e1e1e' : '#ffffff';
}
