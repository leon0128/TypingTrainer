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
    expect(container.querySelector('.cell-cursor')?.textContent).toBe('kyo');
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
