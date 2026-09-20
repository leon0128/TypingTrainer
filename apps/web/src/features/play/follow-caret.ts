/** Horizontal extents in the same coordinate space, as `getBoundingClientRect` gives them. */
export interface Span {
  readonly left: number;
  readonly right: number;
}

/**
 * Room kept between the caret and the panel's edge, so the next few characters stay in view. Also
 * clears the panel's own padding, which the caret would otherwise sit inside.
 */
export const CARET_MARGIN_PX = 48;

/**
 * Where a scrolling panel should be scrolled so the caret is visible, or null when it already is
 * (§8.1). The panel scrolls horizontally when a line is wider than it, but nothing else scrolls it
 * to follow the caret, so without this a wide font, a large size, or a narrow window hides the
 * caret for as many keystrokes as the excess width holds.
 */
export function scrollLeftToShow(
  caret: Span,
  panel: Span & { readonly scrollLeft: number },
): number | null {
  const margin = Math.min(CARET_MARGIN_PX, (panel.right - panel.left) / 4);
  if (caret.right > panel.right - margin) {
    return panel.scrollLeft + (caret.right - (panel.right - margin));
  }
  if (caret.left < panel.left + margin) {
    return Math.max(0, panel.scrollLeft - (panel.left + margin - caret.left));
  }
  return null;
}

/**
 * Brings the caret of a block into view inside its scrolling panel. A panel with nothing to scroll
 * is left alone, and that check comes first so ordinary lines cost no measurement of the caret.
 */
export function followCaret(pre: HTMLElement): void {
  const panel = pre.parentElement;
  if (panel === null) return;
  if (panel.scrollWidth <= panel.clientWidth) {
    if (panel.scrollLeft !== 0) panel.scrollLeft = 0;
    return;
  }
  const caret = pre.querySelector('.cell-cursor');
  if (caret === null) return;
  // Read field by field: a DOMRect's properties live on its prototype, so spreading it copies none.
  const caretRect = caret.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const target = scrollLeftToShow(
    { left: caretRect.left, right: caretRect.right },
    { left: panelRect.left, right: panelRect.right, scrollLeft: panel.scrollLeft },
  );
  if (target !== null) panel.scrollLeft = target;
}
