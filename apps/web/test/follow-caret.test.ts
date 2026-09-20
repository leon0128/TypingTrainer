// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { CARET_MARGIN_PX, followCaret, scrollLeftToShow } from '../src/features/play/follow-caret';

const panel = { left: 100, right: 1100, scrollLeft: 0 };

describe('scrollLeftToShow', () => {
  it('leaves a caret that is in view alone', () => {
    expect(scrollLeftToShow({ left: 500, right: 511 }, panel)).toBeNull();
    // Right up to the margin is still in view.
    expect(scrollLeftToShow({ left: 1000, right: 1100 - CARET_MARGIN_PX }, panel)).toBeNull();
  });

  it('scrolls right just far enough to bring the caret inside the margin', () => {
    const caret = { left: 1150, right: 1161 };
    expect(scrollLeftToShow(caret, panel)).toBe(1161 - (1100 - CARET_MARGIN_PX));
  });

  it('adds to the scroll already made', () => {
    expect(scrollLeftToShow({ left: 1150, right: 1161 }, { ...panel, scrollLeft: 300 })).toBe(
      300 + 1161 - (1100 - CARET_MARGIN_PX),
    );
  });

  it('scrolls back left when the caret is behind the panel, never below zero', () => {
    expect(scrollLeftToShow({ left: 60, right: 71 }, { ...panel, scrollLeft: 500 })).toBe(
      500 - (100 + CARET_MARGIN_PX - 60),
    );
    expect(scrollLeftToShow({ left: 60, right: 71 }, { ...panel, scrollLeft: 10 })).toBe(0);
  });

  it('shrinks the margin on a panel too narrow for it', () => {
    const narrow = { left: 0, right: 100, scrollLeft: 0 };
    // A margin of 25 (a quarter of the width), not 48: a caret at 80 is still in view.
    expect(scrollLeftToShow({ left: 60, right: 71 }, narrow)).toBeNull();
    expect(scrollLeftToShow({ left: 80, right: 91 }, narrow)).toBe(91 - 75);
  });
});

/** A panel and block with the geometry jsdom does not compute. */
function block(geometry: {
  scrollWidth: number;
  clientWidth: number;
  scrollLeft?: number;
  panelRect: Span;
  caretRect?: Span;
}) {
  const panel = document.createElement('section');
  const pre = document.createElement('pre');
  panel.append(pre);
  Object.defineProperty(panel, 'scrollWidth', { value: geometry.scrollWidth });
  Object.defineProperty(panel, 'clientWidth', { value: geometry.clientWidth });
  panel.scrollLeft = geometry.scrollLeft ?? 0;
  panel.getBoundingClientRect = () => new Rect(geometry.panelRect) as unknown as DOMRect;
  let measured = 0;
  const caretRect = geometry.caretRect;
  if (caretRect !== undefined) {
    const caret = document.createElement('span');
    caret.className = 'cell-cursor';
    caret.getBoundingClientRect = () => {
      measured += 1;
      return new Rect(caretRect) as unknown as DOMRect;
    };
    pre.append(caret);
  }
  return { panel, pre, measured: () => measured };
}

interface Span {
  left: number;
  right: number;
}

/** Like a real DOMRect, whose fields are getters on the prototype and not own properties. */
class Rect {
  constructor(private readonly span: Span) {}
  get left() {
    return this.span.left;
  }
  get right() {
    return this.span.right;
  }
}

describe('followCaret', () => {
  it('does not even measure the caret when the lines fit', () => {
    const { pre, measured } = block({
      scrollWidth: 900,
      clientWidth: 900,
      panelRect: { left: 0, right: 900 },
      caretRect: { left: 2000, right: 2011 },
    });
    followCaret(pre);
    expect(measured()).toBe(0);
  });

  it('scrolls a wide line so the caret comes into view', () => {
    const { panel, pre } = block({
      scrollWidth: 1300,
      clientWidth: 900,
      panelRect: { left: 0, right: 900 },
      caretRect: { left: 950, right: 961 },
    });
    followCaret(pre);
    expect(panel.scrollLeft).toBe(961 - (900 - CARET_MARGIN_PX));
  });

  it('returns to the start when the next block has nothing to scroll', () => {
    const { panel, pre } = block({
      scrollWidth: 800,
      clientWidth: 900,
      scrollLeft: 250,
      panelRect: { left: 0, right: 900 },
    });
    followCaret(pre);
    expect(panel.scrollLeft).toBe(0);
  });

  it('does nothing without a caret or a panel', () => {
    const { panel, pre } = block({
      scrollWidth: 1300,
      clientWidth: 900,
      panelRect: { left: 0, right: 900 },
    });
    followCaret(pre);
    expect(panel.scrollLeft).toBe(0);
    expect(() => {
      followCaret(document.createElement('pre'));
    }).not.toThrow();
  });
});
