// @vitest-environment jsdom
import type { TypingProgram } from '@typing-trainer/contracts';
import { createEngineState, handleKey } from '@typing-trainer/typing-engine';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { JaView } from '../src/features/play/JaView';
import { jaLines, spellingFor } from '../src/features/play/ja-view';
import { lookahead } from '../src/features/play/lookahead';

/** きょう (今日 over きょ+う), then a line break, then し. */
const PROGRAM: TypingProgram = {
  blockId: 'ja-word/00000000',
  atoms: [
    { kind: 'romaji', display: '今日', alternatives: ['kyo', 'kilyo'] },
    { kind: 'romaji', display: '', alternatives: ['u'] },
    { kind: 'separator', canonical: '\n', required: true },
    { kind: 'romaji', display: 'し', alternatives: ['shi', 'si', 'ci'] },
  ],
  canonicalKeystrokes: 6,
};

const press = (keys: string[]) =>
  keys.reduce((state, key) => handleKey(state, key).state, createEngineState(PROGRAM));

describe('jaLines', () => {
  it('groups a text over the units it is read with, and splits at line breaks', () => {
    const lines = jaLines(PROGRAM, null);
    expect(lines.map((line) => line.groups.map((g) => [g.display, g.units.length]))).toEqual([
      [['今日', 2]],
      [['し', 1]],
    ]);
    expect(lines[0]?.eol?.state).toBe('pending');
    expect(lines[1]?.eol).toBeNull();
  });

  it('puts the caret on the unit being typed and redraws along the route settled on', () => {
    const [first, second] = jaLines(PROGRAM, press(['k', 'i']))[0]?.groups[0]?.units ?? [];
    expect(first).toMatchObject({ state: 'cursor', typed: 'ki', rest: 'lyo' });
    expect(second).toMatchObject({ state: 'pending', typed: '', rest: 'u' });
  });

  it('marks left units typed, and everything typed once the block is complete', () => {
    const half = jaLines(PROGRAM, press(['k', 'y', 'o']))[0];
    expect(half?.groups[0]?.units.map((u) => u.state)).toEqual(['typed', 'cursor']);
    const done = jaLines(PROGRAM, press(['k', 'y', 'o', 'u', 'Enter', 's', 'i']));
    expect(done.flatMap((l) => l.groups.flatMap((g) => g.units.map((u) => u.state)))).toEqual([
      'typed',
      'typed',
      'typed',
    ]);
    expect(done[0]?.eol?.state).toBe('typed');
  });

  it('shows the first spelling that begins with the keys typed', () => {
    const atom = PROGRAM.atoms[3];
    if (atom?.kind !== 'romaji') throw new Error('fixture');
    expect(spellingFor(atom, '')).toBe('shi');
    expect(spellingFor(atom, 'c')).toBe('ci');
  });
});

describe('JaView', () => {
  it('draws the text above and the romaji below', () => {
    const { container } = render(
      <JaView program={PROGRAM} engine={press(['k'])} missSeq={0} lastMiss={null} />,
    );
    expect(container.querySelector('.ja-text')?.textContent).toBe('今日');
    // Only the next romaji key is highlighted, not the whole unit: "k" of "kyo" has been typed
    // already, so the cursor cell is "y" and "o" trails behind it, dimmed (the untyped second
    // unit, "u", is also a whole cell-pending span, so both are checked by position, scoped to
    // the first line's romaji row to leave out the second line's untouched "shi").
    expect(container.querySelector('.cell-typed')?.textContent).toBe('k');
    expect(container.querySelector('.cell-cursor')?.textContent).toBe('y');
    const firstLineRomaji = container.querySelector('.ja-line .ja-romaji');
    expect(
      [...(firstLineRomaji?.querySelectorAll('.cell-pending') ?? [])].map(
        (cell) => cell.textContent,
      ),
    ).toEqual(['o', 'u']);
  });

  it('keeps the text on a row of its own, so the romaji cannot open gaps in it', () => {
    const { container } = render(
      <JaView program={PROGRAM} engine={null} missSeq={0} lastMiss={null} />,
    );
    const rows = [...container.querySelectorAll('.ja-texts')].map((row) => row.textContent);
    expect(rows).toEqual(['今日', 'し']);
  });
});

describe('lookahead', () => {
  it('shows three short blocks after the current one, and one long one', () => {
    expect(lookahead('ja-word')).toBe(3);
    expect(lookahead('en-line')).toBe(3);
    expect(lookahead('ja-paragraph')).toBe(1);
    expect(lookahead('en-paragraph')).toBe(1);
    expect(lookahead('go')).toBe(1);
  });
});
