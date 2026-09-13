import { describe, expect, it } from 'vitest';

import { createEngineState, handleKey, isComplete } from '../src';
import { A, L, NL, P, SP, play, program } from './helpers';

/**
 * ```ts
 * if (ok) {
 *   run();
 * }
 * done();
 * ```
 */
const IF_BLOCK = program([
  L('if'), //       0
  SP(false), //     1
  L('('), //        2
  L('ok'), //       3
  A(')', 2), //     4
  SP(false), //     5
  L('{'), //        6
  NL, //            7
  A('  ', 7), //    8
  L('run'), //      9
  L('('), //       10
  A(')', 10), //   11
  L(';'), //       12
  NL, //           13
  A('}', 6), //    14
  NL, //           15
  L('done'), //    16
  L('('), //       17
  A(')', 17), //   18
  L(';'), //       19
]);

/** `foo(bar(baz(1)))` followed by a line break and `next`. */
const NESTED_CLOSE = program([
  L('foo'), //      0
  L('('), //        1
  L('bar'), //      2
  L('('), //        3
  L('baz'), //      4
  L('('), //        5
  L('1'), //        6
  A(')', 5), //     7
  A(')', 3), //     8
  A(')', 1), //     9
  NL, //           10
  L('next'), //    11
]);

/** `return { ok: true }` followed by a line break and `x`. */
const RETURN_OBJECT = program([
  L('return'), //   0
  SP(true), //      1
  L('{'), //        2
  SP(false), //     3
  L('ok'), //       4
  L(':'), //        5
  SP(false), //     6
  L('true'), //     7
  SP(false), //     8
  A('}', 2), //     9
  NL, //           10
  L('x'), //       11
]);

/** `export { a, b }` — ends with identifier, optional space, auto `}`. */
const EXPORT_LIST = program([
  L('export'), //   0
  SP(true), //      1
  L('{'), //        2
  SP(false), //     3
  L('a'), //        4
  L(','), //        5
  SP(false), //     6
  L('b'), //        7
  SP(false), //     8
  A('}', 2), //     9
]);

/** `(x ) in` — an optional space, an auto `)`, then a required space. */
const SEPARATOR_CHAIN = program([
  L('('), //        0
  L('x'), //        1
  SP(false), //     2
  A(')', 0), //     3
  SP(true), //      4
  L('in'), //       5
]);

/** `x = foo` */
const ASSIGNMENT = program([L('x'), SP(false), L('='), SP(false), L('foo')]);

/** `const x` */
const CONST_DECL = program([L('const'), SP(true), L('x')]);

describe('literals and miss deduplication', () => {
  it('counts skipping `f` in `for` as exactly one miss (§3.4)', () => {
    const { state, verdicts } = play(program([L('for')]), 'or');
    expect(verdicts).toEqual(['MISS', 'MISS']);
    expect(state.counters.miss).toBe(1);

    const finished = play(state, 'for').state;
    expect(isComplete(finished)).toBe(true);
    expect(finished.counters).toEqual({ raw: 5, effective: 3, miss: 1, ignored: 0 });
  });

  it('records a new miss after the cursor advances, even without a CORRECT verdict', () => {
    // Tab misses in place at the optional space; `o` passes it (cursor moves) and misses at `f`.
    const { state, verdicts } = play(ASSIGNMENT, 'x=⇥or');
    expect(verdicts).toEqual(['CORRECT', 'CORRECT', 'MISS', 'MISS', 'MISS']);
    expect(state.counters.miss).toBe(2);
    expect(state.atomIndex).toBe(4);
  });

  it('never counts a miss twice around a consumed separator', () => {
    const { state, verdicts } = play(ASSIGNMENT, 'x= qq');
    expect(verdicts).toEqual(['CORRECT', 'CORRECT', 'CORRECT', 'MISS', 'MISS']);
    expect(state.counters.miss).toBe(1);
  });
});

describe('required and optional space separators', () => {
  it('misses at a required space until Space is pressed', () => {
    const { state, verdicts } = play(CONST_DECL, 'constxx⏎ x');
    expect(verdicts.slice(5)).toEqual(['MISS', 'MISS', 'MISS', 'CORRECT', 'CORRECT']);
    expect(state.counters.miss).toBe(1);
    expect(isComplete(state)).toBe(true);
    expect(state.counters.effective).toBe(CONST_DECL.canonicalKeystrokes);
  });

  it('credits a skipped optional separator (§3.5)', () => {
    const { state } = play(ASSIGNMENT, 'x=foo');
    expect(isComplete(state)).toBe(true);
    expect(state.counters.effective).toBe(ASSIGNMENT.canonicalKeystrokes);
  });

  it('rejects Enter at an in-line space separator when a literal is due (Q8)', () => {
    const { state, verdicts } = play(ASSIGNMENT, 'x⏎');
    expect(verdicts).toEqual(['CORRECT', 'MISS']);
    expect(state.atomIndex).toBe(1);
  });

  it('rejects Tab at an optional space separator and stays in place', () => {
    const { state, verdicts } = play(ASSIGNMENT, 'x⇥');
    expect(verdicts).toEqual(['CORRECT', 'MISS']);
    expect(state.atomIndex).toBe(1);
    expect(state.separatorConsumed).toBe(false);
  });
});

describe('line-break separators', () => {
  it('rejects Space where a line break is due (Q8)', () => {
    const { state, verdicts } = play(IF_BLOCK, 'if(ok{ ');
    expect(verdicts.at(-1)).toBe('MISS');
    expect(state.atomIndex).toBe(7);
  });

  it('accepts one Enter, then treats repeated Enters as a single miss', () => {
    const { state, verdicts } = play(IF_BLOCK, 'if (ok {⏎⏎⏎');
    expect(verdicts.slice(-3)).toEqual(['CORRECT', 'MISS', 'MISS']);
    expect(state.counters.miss).toBe(1);
    expect(state.atomIndex).toBe(9);

    const next = play(state, 'run');
    expect(next.verdicts).toEqual(['CORRECT', 'CORRECT', 'CORRECT']);
  });

  it('treats repeated Tabs at a line break as a single miss and stays in place', () => {
    const { state, verdicts } = play(IF_BLOCK, 'if (ok {⇥⇥⏎');
    expect(verdicts.slice(-3)).toEqual(['MISS', 'MISS', 'CORRECT']);
    expect(state.counters.miss).toBe(1);
    expect(state.atomIndex).toBe(9);
  });

  it('makes Space at the start of an auto-indented line a miss (Q30)', () => {
    const { state, verdicts } = play(IF_BLOCK, 'if(ok{⏎ ');
    expect(verdicts.at(-1)).toBe('MISS');
    expect(state.atomIndex).toBe(9);
  });

  it('requires one Enter into and one Enter out of a line holding only an auto `}`', () => {
    const { state, verdicts } = play(IF_BLOCK, 'if(ok{⏎run(;⏎}⏎done(;');
    expect(verdicts.filter((verdict) => verdict === 'MISS')).toHaveLength(1);
    expect(isComplete(state)).toBe(true);
    expect(state.counters.effective).toBe(IF_BLOCK.canonicalKeystrokes);
  });
});

describe('auto-inserted characters (Q6)', () => {
  it('makes typing an auto-inserted closing bracket a miss', () => {
    const { state, verdicts } = play(IF_BLOCK, 'if(ok{⏎run()');
    expect(verdicts.at(-1)).toBe('MISS');
    expect(state.atomIndex).toBe(12);
  });

  it('skips a run of nested auto `)))` in one step and then expects the line break', () => {
    const typed = play(NESTED_CLOSE, 'foo(bar(baz(1');
    expect(typed.verdicts.every((verdict) => verdict === 'CORRECT')).toBe(true);
    expect(typed.state.atomIndex).toBe(10);

    const extraParen = play(typed.state, ')');
    expect(extraParen.verdicts).toEqual(['MISS']);
    expect(extraParen.state.atomIndex).toBe(10);

    const finished = play(typed.state, '⏎next');
    expect(finished.verdicts).toEqual(['CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT']);
    expect(isComplete(finished.state)).toBe(true);
    expect(finished.state.counters.effective).toBe(NESTED_CLOSE.canonicalKeystrokes);
  });
});

describe('optional space, auto `}`, line break: `return { ok: true }`', () => {
  const beforeSpace = play(RETURN_OBJECT, 'return {ok: true').state;

  it('stops at the optional space after `true`', () => {
    expect(beforeSpace.atomIndex).toBe(8);
    expect(beforeSpace.separatorConsumed).toBe(false);
  });

  it('accepts Enter directly, passing the optional space and crediting both separators', () => {
    const { state, verdicts } = play(beforeSpace, '⏎');
    expect(verdicts).toEqual(['CORRECT']);
    expect(state.atomIndex).toBe(11);
    expect(state.counters.effective).toBe(beforeSpace.counters.effective + 2);
  });

  it('accepts Space then Enter', () => {
    const { state, verdicts } = play(beforeSpace, ' ⏎');
    expect(verdicts).toEqual(['CORRECT', 'CORRECT']);
    expect(state.atomIndex).toBe(11);
    expect(state.counters.effective).toBe(beforeSpace.counters.effective + 2);
  });

  it('handles Space, Space, Enter: consume, ignore, then pass to the line break', () => {
    const first = handleKey(beforeSpace, ' ');
    expect(first.verdict).toBe('CORRECT');
    expect(first.state.atomIndex).toBe(8);
    expect(first.state.separatorConsumed).toBe(true);
    expect(first.state.counters.effective).toBe(beforeSpace.counters.effective + 1);

    // The next typed atom is the line break behind the auto `}`, not a space: IGNORED.
    const second = handleKey(first.state, ' ');
    expect(second.verdict).toBe('IGNORED');
    expect(second.state.atomIndex).toBe(8);
    expect(second.state.separatorConsumed).toBe(true);
    expect(second.state.counters.effective).toBe(first.state.counters.effective);
    expect(second.state.counters.ignored).toBe(1);
    expect(second.state.counters.miss).toBe(0);

    const enter = handleKey(second.state, 'Enter');
    expect(enter.verdict).toBe('CORRECT');
    expect(enter.state.atomIndex).toBe(11);
    expect(enter.state.counters.effective).toBe(second.state.counters.effective + 1);

    const done = handleKey(enter.state, 'x');
    expect(done.verdict).toBe('CORRECT');
    expect(isComplete(done.state)).toBe(true);
    expect(done.state.counters).toEqual({
      raw: beforeSpace.counters.raw + 4,
      effective: RETURN_OBJECT.canonicalKeystrokes,
      miss: 0,
      ignored: 1,
    });
  });

  it('rejects Tab at the optional space and stays in place', () => {
    const { state, verdicts } = play(beforeSpace, '⇥');
    expect(verdicts).toEqual(['MISS']);
    expect(state.atomIndex).toBe(8);
  });
});

describe('separator chains through auto atoms', () => {
  it('passes a repeated Space on to a following space separator', () => {
    const { state, verdicts } = play(SEPARATOR_CHAIN, '(x   in');
    expect(verdicts).toEqual([
      'CORRECT',
      'CORRECT',
      'CORRECT',
      'CORRECT',
      'IGNORED',
      'CORRECT',
      'CORRECT',
    ]);
    expect(isComplete(state)).toBe(true);
    expect(state.counters.effective).toBe(SEPARATOR_CHAIN.canonicalKeystrokes);
    expect(state.counters.ignored).toBe(1);
  });

  it('passes an optional space but stops with a miss at a following required space', () => {
    const { state, verdicts } = play(SEPARATOR_CHAIN, '(xi in');
    expect(verdicts).toEqual(['CORRECT', 'CORRECT', 'MISS', 'CORRECT', 'CORRECT', 'CORRECT']);
    expect(isComplete(state)).toBe(true);
    expect(state.counters.miss).toBe(1);
    expect(state.counters.effective).toBe(SEPARATOR_CHAIN.canonicalKeystrokes);
  });
});

/** `"width":  80,` with gofmt alignment padding before the space separator. */
const ALIGNED_ENTRY = program([
  L('"'), //       0
  L('width'), //   1
  A('"', 0), //    2
  L(':'), //       3
  P(' '), //       4
  SP(false), //    5
  L('80'), //      6
  L(','), //       7
]);

describe('alignment padding', () => {
  it('skips padding as soon as the literal before it is typed', () => {
    const { state } = play(ALIGNED_ENTRY, '"width:');
    expect(state.atomIndex).toBe(5);
    expect(state.counters.effective).toBe('"width:'.length);
  });

  it('credits the separator once whether it is skipped, typed once, or typed repeatedly', () => {
    for (const script of ['"width:80,', '"width: 80,', '"width:   80,']) {
      const { state, verdicts } = play(ALIGNED_ENTRY, script);
      expect(verdicts).not.toContain('MISS');
      expect(isComplete(state)).toBe(true);
      expect(state.counters.effective).toBe(ALIGNED_ENTRY.canonicalKeystrokes);
    }
  });
});

describe('completion', () => {
  it('completes the moment the last literal is typed when only passable atoms remain', () => {
    const beforeB = play(EXPORT_LIST, 'export {a,').state;
    expect(isComplete(beforeB)).toBe(false);

    const afterB = handleKey(beforeB, 'b');
    expect(afterB.verdict).toBe('CORRECT');
    expect(isComplete(afterB.state)).toBe(true);
    expect(afterB.state.counters.effective).toBe(EXPORT_LIST.canonicalKeystrokes);
  });

  it('completes after `b` regardless of which optional spaces were typed', () => {
    const { state } = play(EXPORT_LIST, 'export { a, b');
    expect(isComplete(state)).toBe(true);
    expect(state.counters.effective).toBe(EXPORT_LIST.canonicalKeystrokes);
  });

  it('treats handleKey on a complete state as a no-op returning IGNORED', () => {
    const complete = play(EXPORT_LIST, 'export {a,b').state;
    const result = handleKey(complete, 'x');
    expect(result.verdict).toBe('IGNORED');
    expect(result.state).toBe(complete);
  });

  it('does not mutate the input state', () => {
    const initial = createEngineState(ASSIGNMENT);
    // The engine's lib is ES2022 only, so there is no structuredClone here.
    const snapshot: unknown = JSON.parse(JSON.stringify(initial));
    handleKey(initial, 'x');
    handleKey(initial, 'q');
    expect(initial).toEqual(snapshot);
  });
});
