import { describe, expect, it } from 'vitest';

import { buildLayout } from '../src/features/play/layout';
import { caretOf, cellStates, lineViews } from '../src/features/play/line-view';
import { IF_PROGRAM, typed } from './program-fixture';

const layout = buildLayout(IF_PROGRAM);
const views = (script: string) => lineViews(layout, typed(IF_PROGRAM, script));

describe('caretOf', () => {
  it('sits on the current atom, or on the next typed atom after a consumed space', () => {
    expect(caretOf(typed(IF_PROGRAM, 'if'))).toEqual({ atomIndex: 1, charIndex: 0 });
    expect(caretOf(typed(IF_PROGRAM, 'if '))).toEqual({ atomIndex: 2, charIndex: 0 });
    expect(caretOf(typed(IF_PROGRAM, 'i'))).toEqual({ atomIndex: 0, charIndex: 1 });
  });

  it('is null once the program is complete', () => {
    expect(caretOf(typed(IF_PROGRAM, 'if(a{⏎b⏎'))).toBeNull();
  });
});

describe('lineViews', () => {
  it('starts with the caret on the first cell', () => {
    expect(views('')).toEqual([
      { typedUntil: 0, cursorHere: true, filledAutoKey: '' },
      { typedUntil: 0, cursorHere: false, filledAutoKey: '' },
      { typedUntil: 0, cursorHere: false, filledAutoKey: '' },
    ]);
  });

  it('draws the caret on the optional space, then past it once consumed', () => {
    expect(views('if')[0]).toEqual({ typedUntil: 2, cursorHere: true, filledAutoKey: '' });
    expect(views('if ')[0]).toEqual({ typedUntil: 3, cursorHere: true, filledAutoKey: '' });
  });

  it('fills a closer on the same line as soon as its opener is typed', () => {
    expect(views('if (')[0]).toEqual({ typedUntil: 4, cursorHere: true, filledAutoKey: '4' });
  });

  it('updates a distant line when `{` fills its `}`', () => {
    const [first, second, third] = views('if (a {');
    expect(first).toEqual({ typedUntil: 8, cursorHere: true, filledAutoKey: '4' });
    expect(second).toEqual({ typedUntil: 0, cursorHere: false, filledAutoKey: '' });
    expect(third).toEqual({ typedUntil: 0, cursorHere: false, filledAutoKey: '11' });
  });

  it('moves the caret past the filled indentation after Enter', () => {
    const [first, second] = views('if (a {⏎');
    expect(first).toEqual({ typedUntil: 9, cursorHere: false, filledAutoKey: '4' });
    expect(second).toEqual({ typedUntil: 2, cursorHere: true, filledAutoKey: '8' });
  });

  it('marks every line typed once complete', () => {
    expect(views('if(a{⏎b⏎')).toEqual([
      { typedUntil: 9, cursorHere: false, filledAutoKey: '4' },
      { typedUntil: 4, cursorHere: false, filledAutoKey: '8' },
      { typedUntil: 1, cursorHere: false, filledAutoKey: '11' },
    ]);
  });
});

describe('cellStates', () => {
  it('derives the four §8.1 states plus unfilled autos', () => {
    const [line0, line1, line2] = layout.lines;
    const [view0, view1, view2] = views('if (a {');
    if (!line0 || !line1 || !line2 || !view0 || !view1 || !view2) throw new Error('layout');

    expect(cellStates(line0, view0)).toEqual([
      'typed',
      'typed',
      'typed',
      'typed',
      'typed',
      'auto-filled',
      'typed',
      'typed',
      'cursor',
    ]);
    expect(cellStates(line1, view1)).toEqual([
      'auto-pending',
      'auto-pending',
      'pending',
      'pending',
    ]);
    expect(cellStates(line2, view2)).toEqual(['auto-filled']);
  });
});
