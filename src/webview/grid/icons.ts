// Inline SVG glyphs (16px viewBox, currentColor) used in headers, the gutter and the cell menu.

// Small link glyph → a foreign-key column; small stacked-lines glyph → an indexed column.
export const FK_SVG =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.6 9.4 9.4 6.6"/><path d="M7.2 4.6 8.3 3.5a2.4 2.4 0 0 1 3.4 3.4L10.6 8"/><path d="M8.8 11.4 7.7 12.5a2.4 2.4 0 0 1-3.4-3.4L5.4 8"/></svg>';
export const INDEX_SVG =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M3.5 4.5h9M3.5 8h6M3.5 11.5h3.5"/></svg>';

// A funnel glyph (not a triangle, which reads as a sort control) for the local filter toggle.
export const FUNNEL_SVG =
  '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 3h12a.5.5 0 0 1 .4.8L10 9.2V13a.5.5 0 0 1-.7.45l-2-1A.5.5 0 0 1 7 12V9.2L1.6 3.8A.5.5 0 0 1 2 3z"/></svg>';

// Cell-menu glyphs: a funnel (filter), an arrow-out (jump to referenced row), stacked rows (incoming rows).
export const MENU_FILTER_SVG = FUNNEL_SVG;
export const MENU_GOTO_SVG =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3.5H3.5v9h9V9"/><path d="M9.5 3.5H12.5V6.5"/><path d="M12.5 3.5 7.5 8.5"/></svg>';
export const MENU_ROWS_SVG =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M3 4.5h10M3 8h10M3 11.5h10"/></svg>';
export const MENU_TRASH_SVG =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5h10"/><path d="M6.5 4.5v-1h3v1"/><path d="M4.5 4.5 5 13h6l.5-8.5"/><path d="M6.8 7v4M9.2 7v4"/></svg>';
export const MENU_RESTORE_SVG =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.6"/><path d="M3 3v3h3"/></svg>';

// Value actions: a struck-out circle for NULL, an empty pair of quotes for the empty string.
export const MENU_NULL_SVG =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="5"/><path d="M4.5 11.5 11.5 4.5"/></svg>';
export const MENU_EMPTY_SVG =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M5 4.5v3M6.8 4.5v3M9.2 4.5v3M11 4.5v3"/><path d="M4 12h8"/></svg>';
