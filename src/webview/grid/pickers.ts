import type { FkOption } from '../../domain/gridProtocol';
import { positionPopupUnder, trackPopup } from './popup';
import type { CellValue } from './rowModel';

// Floating searchable dropdowns: one for ENUM cells, one for foreign-key cells (key + label).
// Both close on Escape, on a click outside, and hide when their anchor scrolls out of view.
const enumPop = createPopup('enum-pop');
const fkPop = createPopup('enum-pop fk-pop');

// The cell each dropdown is anchored to, so it can follow the cell when the grid scrolls.
let enumAnchor: HTMLElement | null = null;
let fkAnchor: HTMLElement | null = null;

function createPopup(className: string): HTMLDivElement {
  const pop = document.createElement('div');
  pop.className = className;
  pop.hidden = true;
  document.body.appendChild(pop);
  return pop;
}

document.addEventListener(
  'scroll',
  () => {
    trackPopup(enumPop, enumAnchor);
    trackPopup(fkPop, fkAnchor);
  },
  true,
);
document.addEventListener('mousedown', (event) => {
  const target = event.target as Node;
  if (!enumPop.hidden && !enumPop.contains(target) && !(target instanceof HTMLElement && target.closest('.cell-enum'))) {
    enumPop.hidden = true;
  }
  if (!fkPop.hidden && !fkPop.contains(target) && !(target instanceof HTMLElement && target.closest('td'))) {
    fkPop.hidden = true;
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    enumPop.hidden = true;
    fkPop.hidden = true;
  }
});

// Beyond this many options, the enum dropdown shows only the first N and reveals a search box.
const ENUM_SEARCH_THRESHOLD = 10;

export interface EnumChoice {
  label: string;
  value: CellValue;
}

// Searchable value picker for an enum cell: first N values always shown; a search box appears
// (and scans every value) once the list is long enough to be awkward to scan.
export function openEnumPopup(
  choices: EnumChoice[],
  current: CellValue,
  anchor: HTMLElement,
  onPick: (value: CellValue) => void,
): void {
  const hasSearch = choices.length > ENUM_SEARCH_THRESHOLD;

  enumPop.replaceChildren();
  const list = document.createElement('div');
  list.className = 'enum-pop-list';

  const pick = (value: CellValue): void => {
    enumPop.hidden = true;
    onPick(value);
  };

  const renderList = (needle: string): void => {
    list.replaceChildren();
    const filter = needle.trim().toLowerCase();
    const matches = filter
      ? choices.filter((choice) => choice.label.toLowerCase().includes(filter))
      : choices.slice(0, ENUM_SEARCH_THRESHOLD);
    for (const choice of matches) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'enum-pop-row';
      row.classList.toggle('selected', choice.value === current);
      row.classList.toggle('null', choice.value === null);
      row.textContent = choice.label;
      row.addEventListener('click', () => pick(choice.value));
      list.appendChild(row);
    }
    // Signal that more values exist below the first N (only when not searching).
    const hidden = choices.length - matches.length;
    if (!filter && hidden > 0) {
      const more = document.createElement('div');
      more.className = 'enum-pop-more';
      more.textContent = `+${hidden} more — type to search`;
      list.appendChild(more);
    }
  };

  let search: HTMLInputElement | null = null;
  if (hasSearch) {
    search = buildSearchBox(list);
    search.addEventListener('input', () => renderList(search!.value));
    enumPop.appendChild(search);
  }
  enumPop.appendChild(list);
  renderList('');

  enumAnchor = anchor;
  const rect = anchor.getBoundingClientRect();
  enumPop.style.minWidth = `${rect.width}px`;
  enumPop.hidden = false;
  positionPopupUnder(enumPop, rect);
  if (search) {
    search.focus();
  }
}

export type FkValuesLoader = (search: string, onResult: (options: FkOption[], hasMore: boolean) => void) => void;

// Searchable foreign-key picker: each row shows the referenced key plus a descriptive label
// (name/code/label/…). Search runs server-side through `load`; picking hands back the key.
export function openFkPopup(current: string, anchor: HTMLElement, load: FkValuesLoader, onPick: (value: string) => void): void {
  fkPop.replaceChildren();
  const list = document.createElement('div');
  list.className = 'enum-pop-list';
  const search = buildSearchBox(list);
  fkPop.append(search, list);

  const pick = (value: string): void => {
    fkPop.hidden = true;
    onPick(value);
  };

  const renderRows = (options: FkOption[], hasMore: boolean): void => {
    list.replaceChildren();
    const count = document.createElement('div');
    count.className = 'enum-pop-more';
    count.textContent =
      options.length === 0 ? 'No matching rows' : `${options.length}${hasMore ? '+' : ''} result${options.length > 1 ? 's' : ''}`;
    list.appendChild(count);
    for (const option of options) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'enum-pop-row';
      row.classList.toggle('selected', option.value === current);
      // Same single-line rendering as the enum picker (which renders reliably): label · key.
      row.textContent = option.label !== null ? `${option.label}   ·   ${option.value}` : option.value;
      row.title = option.label !== null ? `${option.label} — ${option.value}` : option.value;
      row.addEventListener('click', () => pick(option.value));
      list.appendChild(row);
    }
    if (hasMore) {
      const more = document.createElement('div');
      more.className = 'enum-pop-more';
      more.textContent = 'Refine your search to narrow further';
      list.appendChild(more);
    }
  };

  // Debounce so typing doesn't fire a query per keystroke; the latest request wins.
  let debounce = 0;
  let latest = 0;
  const loadTerm = (term: string): void => {
    const seq = (latest += 1);
    load(term, (options, hasMore) => {
      if (seq === latest) {
        renderRows(options, hasMore);
      }
    });
  };
  search.addEventListener('input', () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => loadTerm(search.value), 150);
  });

  fkAnchor = anchor;
  const rect = anchor.getBoundingClientRect();
  fkPop.style.minWidth = `${rect.width}px`;
  fkPop.hidden = false;
  // Show a placeholder immediately so the dropdown never looks empty while the query runs.
  const loading = document.createElement('div');
  loading.className = 'enum-pop-more';
  loading.textContent = 'Loading…';
  list.appendChild(loading);
  positionPopupUnder(fkPop, rect);
  loadTerm('');
  search.focus();
}

// Search box wired for the keyboard: Enter picks the first match, ArrowDown jumps into the list.
function buildSearchBox(list: HTMLElement): HTMLInputElement {
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'enum-pop-search';
  search.placeholder = 'Search…';
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      list.querySelector<HTMLButtonElement>('.enum-pop-row')?.click();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      list.querySelector<HTMLButtonElement>('.enum-pop-row')?.focus();
    }
  });
  return search;
}
