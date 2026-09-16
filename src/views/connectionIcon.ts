import * as vscode from 'vscode';
import type { ConnectionConfig } from '../domain/types';

/**
 * Resolves a connection's colour to the icon shown on its tree node and on the
 * tab of every panel it opens (grid, console, designer).
 *
 * VSCode offers no API to tint an editor tab, and `ThemeIcon`'s colour is
 * documented as honoured in tree items only — so the colour reaches a tab as an
 * image. The image is built here as a data URI rather than shipped as a file:
 * one swatch per colour would otherwise mean nine assets to keep in step with
 * the form's palette.
 */

/** Swatch hues offered by the connection form, keyed by the emoji stored on the connection. */
const SWATCH_COLORS: Record<string, string> = {
  '🔴': '#e5484d',
  '🟠': '#e07b39',
  '🟡': '#d6a400',
  '🟢': '#3fa95a',
  '🔵': '#3b82d6',
  '🟣': '#9061d9',
  '🟤': '#9a6b4f',
  '⚫': '#6b7280',
  '⚪': '#c9ccd1',
};

export function getConnectionIcon(connection: ConnectionConfig | undefined): vscode.IconPath {
  const color = connection?.icon ? SWATCH_COLORS[connection.icon] : undefined;
  if (!color) {
    return new vscode.ThemeIcon('database');
  }
  // The explicit size gives the SVG an intrinsic 16px; without it a renderer that
  // does not set background-size would fall back to a 150px default.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="6" fill="${color}"/></svg>`;
  return vscode.Uri.parse(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
}
