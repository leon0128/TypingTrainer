import { TypingProgramSchema, countMaxKeystrokes } from '@typing-trainer/contracts';
import { describe, expect, it } from 'vitest';

import { createEngineState, handleKey, isComplete } from '../src';
import { NL, RM, play, program } from './helpers';

const SHI = RM('し', 'shi', 'si');
const KA = RM('か', 'ka');
/** ん before a consonant: a bare n is enough. */
const N_BARE = RM('ん', 'n', 'nn', "n'", 'xn');
/** ん before a vowel or at the end of a line: a bare n could be the start of the next unit. */
const N_STRICT = RM('ん', 'nn', "n'", 'xn');

const counters = (script: string, ...atoms: Parameters<typeof program>[0]) =>
  play(program(atoms), script).state.counters;

describe('a romaji unit with several spellings', () => {
  it.each(['shi', 'si'])('accepts %s and completes on its last key', (spelling) => {
    const { state, verdicts } = play(program([SHI]), spelling);
    expect(verdicts.every((verdict) => verdict === 'CORRECT')).toBe(true);
    expect(isComplete(state)).toBe(true);
    expect(state.counters).toMatchObject({
      raw: spelling.length,
      effective: spelling.length,
      miss: 0,
    });
  });

  it('counts every key pressed, so a longer spelling scores more keystrokes (§13.5)', () => {
    const p = program([SHI, KA]);
    expect(p.canonicalKeystrokes).toBe(4);
    expect(countMaxKeystrokes(p.atoms)).toBe(5);
    expect(play(p, 'sika').state.counters.effective).toBe(4);
    expect(play(p, 'shika').state.counters.effective).toBe(5);
  });

  it('misses a key that no spelling continues with, and stays in the unit', () => {
    const { state, verdicts } = play(program([SHI]), 'shy');
    expect(verdicts).toEqual(['CORRECT', 'CORRECT', 'MISS']);
    expect(state).toMatchObject({ atomIndex: 0, typed: 'sh', charIndex: 2 });
    expect(state.counters).toMatchObject({ effective: 2, miss: 1 });
  });

  it('follows the route the first key chose: after "s" and "i" the h is too late', () => {
    const { verdicts, state } = play(program([SHI, KA]), 'sik');
    expect(verdicts).toEqual(['CORRECT', 'CORRECT', 'CORRECT']);
    expect(state).toMatchObject({ atomIndex: 1, typed: 'k' });
  });
});

describe('a spelling that another extends (ん)', () => {
  it('lets a bare n stand when the next key belongs to the next unit', () => {
    const { state, verdicts } = play(program([N_BARE, KA]), 'nka');
    expect(verdicts).toEqual(['CORRECT', 'CORRECT', 'CORRECT']);
    expect(isComplete(state)).toBe(true);
    expect(state.counters).toMatchObject({ raw: 3, effective: 3, miss: 0 });
  });

  it.each([
    ['nnka', 4],
    ["n'ka", 4],
    ['xnka', 4],
  ])('also accepts %s', (script, effective) => {
    const { state } = play(program([N_BARE, KA]), script);
    expect(isComplete(state)).toBe(true);
    expect(state.counters).toMatchObject({ effective, miss: 0 });
  });

  it('judges the key that ended the bare n at the next unit, and misses there', () => {
    const { state, verdicts } = play(program([N_BARE, KA]), 'nz');
    expect(verdicts).toEqual(['CORRECT', 'MISS']);
    expect(state).toMatchObject({ atomIndex: 1, typed: '' });
    expect(state.counters).toMatchObject({ raw: 2, effective: 1, miss: 1 });
  });

  it("settles the bare n even when the key misses at the next unit, so n' can no longer follow", () => {
    const { state, verdicts } = play(program([N_BARE, RM('、', ',')]), "nz'");
    expect(verdicts).toEqual(['CORRECT', 'MISS', 'MISS']);
    expect(state).toMatchObject({ atomIndex: 1, typed: '' });
  });

  it('passes a bare n on to a next unit that starts with x', () => {
    const p = program([N_BARE, RM('っか', 'kka', 'xtuka')]);
    const { state, verdicts } = play(p, 'nxtuka');
    expect(verdicts.every((verdict) => verdict === 'CORRECT')).toBe(true);
    expect(isComplete(state)).toBe(true);
  });

  it("needs nn, n', or xn when a bare n is not offered", () => {
    const p = program([N_STRICT, RM('あ', 'a')]);
    expect(play(p, 'na').verdicts).toEqual(['CORRECT', 'MISS']);
    expect(play(p, 'nna').state.counters).toMatchObject({ effective: 3, miss: 0 });
    expect(isComplete(play(p, 'nna').state)).toBe(true);
  });

  it('does not end a line on a bare n: Enter after one n is a miss', () => {
    const p = program([RM('あ', 'a'), N_STRICT, NL, RM('い', 'i')]);
    const { state, verdicts } = play(p, 'an⏎');
    expect(verdicts).toEqual(['CORRECT', 'CORRECT', 'MISS']);
    expect(state).toMatchObject({ atomIndex: 1, typed: 'n' });
    expect(isComplete(play(p, 'ann⏎i').state)).toBe(true);
  });
});

describe('miss handling in a romaji unit', () => {
  it('counts a wrong key once however often it repeats, then again after progress', () => {
    expect(counters('zzz', SHI).miss).toBe(1);
    expect(counters('szzz', SHI).miss).toBe(1);
    expect(counters('zszz', SHI).miss).toBe(2);
  });

  it.each([['S'], [' '], ['⇥'], ['⏎'], ['1']])('misses %s and does not advance', (key) => {
    const { state, verdicts } = play(program([SHI, KA]), key);
    expect(verdicts).toEqual(['MISS']);
    expect(state).toMatchObject({ atomIndex: 0, typed: '' });
    expect(state.counters).toMatchObject({ raw: 1, effective: 0, miss: 1 });
  });

  it('misses an uppercase letter in the middle of a spelling', () => {
    expect(play(program([SHI]), 'sH').verdicts).toEqual(['CORRECT', 'MISS']);
  });
});

describe('lines, completion, and the state', () => {
  it('needs Enter between lines, and completes on the last key', () => {
    const p = program([RM('あ', 'a'), NL, RM('い', 'i')]);
    expect(play(p, 'a').verdicts).toEqual(['CORRECT']);
    expect(play(p, 'ai').verdicts).toEqual(['CORRECT', 'MISS']);
    const done = play(p, 'a⏎i');
    expect(isComplete(done.state)).toBe(true);
    expect(done.state.counters).toMatchObject({ effective: 3, miss: 0 });
  });

  it('ignores every key once complete', () => {
    const done = play(program([RM('あ', 'a')]), 'a').state;
    const result = handleKey(done, 'a');
    expect(result.verdict).toBe('IGNORED');
    expect(result.state).toBe(done);
  });

  it('starts with nothing typed', () => {
    expect(createEngineState(program([SHI]))).toMatchObject({
      atomIndex: 0,
      charIndex: 0,
      typed: '',
    });
  });

  it('keeps the input state unchanged', () => {
    const state = createEngineState(program([SHI]));
    const before = JSON.stringify(state);
    handleKey(state, 's');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('satisfies the program schema, and rejects a unit that could never be completed', () => {
    expect(TypingProgramSchema.safeParse(program([N_BARE, KA])).success).toBe(true);
    // A spelling that another extends, with nothing typed after it, could not be finished by a key
    // that is not part of the longer spelling.
    expect(TypingProgramSchema.safeParse(program([KA, N_BARE])).success).toBe(false);
  });
});
