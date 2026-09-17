// Place a floating popup directly under `rect`, measuring it so it never runs off the right edge
// (shift left) or bottom (flip above). The popup must already be visible to be measurable.
export function positionPopupUnder(pop: HTMLElement, rect: DOMRect): void {
  const margin = 8;
  let left = rect.left;
  if (left + pop.offsetWidth > window.innerWidth - margin) {
    left = window.innerWidth - pop.offsetWidth - margin;
  }
  left = Math.max(margin, left);
  let top = rect.bottom + 2;
  if (top + pop.offsetHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - pop.offsetHeight - 2);
  }
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}

// Keep an open dropdown glued under its anchor while the page scrolls; hide it once the anchor
// scrolls out of view (a fixed-position popup would otherwise drift over unrelated content).
export function trackPopup(pop: HTMLElement, anchor: HTMLElement | null): void {
  if (pop.hidden || !anchor) {
    return;
  }
  const rect = anchor.getBoundingClientRect();
  const visible = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  if (visible) {
    positionPopupUnder(pop, rect);
  } else {
    pop.hidden = true;
  }
}
