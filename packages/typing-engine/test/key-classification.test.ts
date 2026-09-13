import { describe, expect, it } from 'vitest';

import { classifyKey, type KeyInput } from '../src';

const input = (key: string, overrides: Partial<KeyInput> = {}): KeyInput => ({
  key,
  ctrlKey: false,
  metaKey: false,
  isComposing: false,
  ...overrides,
});

describe('classifyKey (§3.7)', () => {
  it.each(['a', 'Z', '(', '{', ' ', '@', '`'])('sends printable %j to the engine', (key) => {
    expect(classifyKey(input(key))).toEqual({ type: 'engine', key });
  });

  it.each(['Enter', 'Tab'])('sends %s to the engine', (key) => {
    expect(classifyKey(input(key))).toEqual({ type: 'engine', key });
  });

  it.each([
    'Shift',
    'Control',
    'Alt',
    'Meta',
    'CapsLock',
    'Backspace',
    'ArrowLeft',
    'Escape',
    'Dead',
    'F5',
  ])('ignores %s', (key) => {
    expect(classifyKey(input(key))).toEqual({ type: 'ignore' });
  });

  it('passes browser shortcuts through when Ctrl or Meta is held', () => {
    expect(classifyKey(input('c', { ctrlKey: true }))).toEqual({ type: 'passthrough' });
    expect(classifyKey(input('r', { metaKey: true }))).toEqual({ type: 'passthrough' });
  });

  it('reports IME composition', () => {
    expect(classifyKey(input('a', { isComposing: true }))).toEqual({ type: 'ime' });
    expect(classifyKey(input('Process'))).toEqual({ type: 'ime' });
  });
});
