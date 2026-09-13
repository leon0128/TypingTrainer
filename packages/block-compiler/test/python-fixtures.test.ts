import { countCanonicalKeystrokes, type Atom } from '@typing-trainer/contracts';
import { describe, expect, it } from 'vitest';

import { compileBlock, pythonAdapter } from '../src';
import { A, L, NL, R, S, readFixture, render } from './helpers';

const I = (levels: number, filledBy: number) => A('    '.repeat(levels), filledBy);

/**
 * Hand-verified atom sequences for the Python fixtures (black, 4-space indentation). `R` marks
 * separators whose tokens would fuse, `S` optional ones, and `I(n, i)` n levels of indentation
 * filled by the line break at index i. A dedent is just a shorter `I` (or none at the top level).
 */
// prettier-ignore
const FIXTURES: Record<string, Atom[]> = {
  'nesting.py': [
    // def count_matches(grid, target):
    L('def'), R, L('count_matches'), L('('), L('grid'), L(','), S, L('target'), //       0-7
    A(')', 3), L(':'), NL, I(1, 10), //                                                   8-11
    // total = 0
    L('total'), S, L('='), S, L('0'), NL, I(1, 17), //                                   12-18
    // for row in grid:
    L('for'), R, L('row'), R, L('in'), R, L('grid'), L(':'), NL, I(2, 27), //            19-28
    // for cell in row:
    L('for'), R, L('cell'), R, L('in'), R, L('row'), L(':'), NL, I(3, 37), //            29-38
    // if cell == target:
    L('if'), R, L('cell'), S, L('=='), S, L('target'), L(':'), NL, I(4, 47), //          39-48
    // total += 1               -- dedent from 4 levels to 1 with one Enter
    L('total'), S, L('+='), S, L('1'), NL, I(1, 54), //                                  49-55
    // return total
    L('return'), R, L('total'), //                                                        56-58
  ],

  'decorator.py': [
    // @functools.cache
    L('@'), L('functools'), L('.'), L('cache'), NL, //                                    0-4
    // def fib(n):
    L('def'), R, L('fib'), L('('), L('n'), A(')', 8), L(':'), NL, I(1, 12), //           5-13
    // if n < 2:
    L('if'), R, L('n'), S, L('<'), S, L('2'), L(':'), NL, I(2, 22), //                   14-23
    // return n
    L('return'), R, L('n'), NL, I(1, 27), //                                              24-28
    // return fib(n - 1) + fib(n - 2)
    L('return'), R, L('fib'), L('('), L('n'), S, L('-'), S, L('1'), A(')', 32), //       29-38
    S, L('+'), S, L('fib'), L('('), L('n'), S, L('-'), S, L('2'), A(')', 43), //         39-49
  ],

  'klass.py': [
    // class Counter:
    L('class'), R, L('Counter'), L(':'), NL, I(1, 4), //                                  0-5
    // def __init__(self, start=0):
    L('def'), R, L('__init__'), L('('), L('self'), L(','), S, L('start'), L('='), //     6-14
    L('0'), A(')', 9), L(':'), NL, I(2, 18), //                                          15-19
    // self.value = start
    L('self'), L('.'), L('value'), S, L('='), S, L('start'), NL, I(2, 27), //            20-28
    // self.history = []
    L('self'), L('.'), L('history'), S, L('='), S, L('['), A(']', 35), //                29-36
  ],

  'literals.py': [
    // def literals():
    L('def'), R, L('literals'), L('('), A(')', 3), L(':'), NL, I(1, 6), //               0-7
    // return [1_000, 0x_FF, 1e-3, 2j, r"\d", b"raw", "a" "b", 2**10, 7 // 2]
    L('return'), S, L('['), L('1_000'), L(','), S, L('0x_FF'), L(','), S, //             8-16
    L('1e-3'), L(','), S, L('2j'), L(','), S, //                                         17-22
    L('r"'), L('\\d'), A('"', 23), L(','), S, //                                         23-27
    L('b"'), L('raw'), A('"', 28), L(','), S, //                                         28-32
    L('"'), L('a'), A('"', 33), S, L('"'), L('b'), A('"', 37), L(','), S, //            33-41
    L('2'), L('**'), L('10'), L(','), S, L('7'), S, L('//'), S, L('2'), A(']', 10), //  42-52
  ],

  'keywords.py': [
    // def pick(names, banned):
    L('def'), R, L('pick'), L('('), L('names'), L(','), S, L('banned'), A(')', 3), //    0-8
    L(':'), NL, I(1, 10), //                                                              9-11
    // kept = [name for name in names if name not in banned and name is not None]
    L('kept'), S, L('='), S, L('['), L('name'), R, L('for'), R, L('name'), R, //        12-22
    L('in'), R, L('names'), R, L('if'), R, L('name'), R, L('not'), R, L('in'), R, //    23-34
    L('banned'), R, L('and'), R, L('name'), R, L('is'), R, L('not'), R, L('None'), //   35-45
    A(']', 16), NL, I(1, 47), //                                                          46-48
    // key = lambda name: (len(name), name)
    L('key'), S, L('='), S, L('lambda'), R, L('name'), L(':'), S, L('('), L('len'), //  49-59
    L('('), L('name'), A(')', 60), L(','), S, L('name'), A(')', 58), NL, I(1, 67), //   60-68
    // if (count := len(kept)) > 0:
    L('if'), S, L('('), L('count'), S, L(':='), S, L('len'), L('('), L('kept'), //      69-78
    A(')', 77), A(')', 71), S, L('>'), S, L('0'), L(':'), NL, I(2, 86), //              79-87
    // return sorted(kept, key=key)[:count]
    L('return'), R, L('sorted'), L('('), L('kept'), L(','), S, L('key'), L('='), //     88-96
    L('key'), A(')', 91), L('['), L(':'), L('count'), A(']', 99), NL, I(1, 103), //     97-104
    // return []
    L('return'), S, L('['), A(']', 107), //                                              105-108
  ],

  'resources.py': [
    // def read_first(path):
    L('def'), R, L('read_first'), L('('), L('path'), A(')', 3), L(':'), NL, I(1, 7), // 0-8
    // try:
    L('try'), L(':'), NL, I(2, 11), //                                                    9-12
    // with open(path, encoding="utf-8") as handle:
    L('with'), R, L('open'), L('('), L('path'), L(','), S, L('encoding'), L('='), //    13-21
    L('"'), L('utf-8'), A('"', 22), A(')', 16), S, L('as'), R, L('handle'), L(':'), // 22-30
    NL, I(3, 31), //                                                                      31-32
    // return handle.readline()
    L('return'), R, L('handle'), L('.'), L('readline'), L('('), A(')', 38), NL, //     33-40
    I(1, 40), //                                                                          41
    // except (OSError, ValueError) as error:
    L('except'), S, L('('), L('OSError'), L(','), S, L('ValueError'), A(')', 44), S, // 42-50
    L('as'), R, L('error'), L(':'), NL, I(2, 55), //                                     51-56
    // raise RuntimeError(f"cannot read {path}") from error
    L('raise'), R, L('RuntimeError'), L('('), L('f"'), L('cannot read '), L('{'), //   57-63
    L('path'), A('}', 63), A('"', 61), A(')', 60), S, L('from'), R, L('error'), NL, // 64-72
    I(1, 72), //                                                                          73
    // finally:
    L('finally'), L(':'), NL, I(2, 76), //                                               74-77
    // print("done")
    L('print'), L('('), L('"'), L('done'), A('"', 80), A(')', 79), //                  78-83
  ],

  'fstrings.py': [
    // def describe(name, score, width):
    L('def'), R, L('describe'), L('('), L('name'), L(','), S, L('score'), L(','), S, // 0-9
    L('width'), A(')', 3), L(':'), NL, I(1, 13), //                                     10-14
    // label = f"{name!r:>{width}}"
    L('label'), S, L('='), S, L('f"'), L('{'), L('name'), L('!'), L('r'), L(':'), //   15-24
    L('>'), L('{'), L('width'), A('}', 26), A('}', 20), A('"', 19), NL, I(1, 31), //   25-32
    // return rf"\d+ {label}: {score:.2f} ({f'{score * 100:.0f}'}%)"
    L('return'), R, L('rf"'), L('\\d+ '), L('{'), L('label'), A('}', 37), L(': '), // 33-40
    L('{'), L('score'), L(':'), L('.2f'), A('}', 41), L(' ('), L('{'), L("f'"), //     41-48
    L('{'), L('score'), S, L('*'), S, L('100'), L(':'), L('.0f'), A('}', 49), //       49-57
    A("'", 48), A('}', 47), L('%)'), A('"', 35), //                                     58-61
  ],
};

describe('Python fixtures', () => {
  it.each(Object.keys(FIXTURES))('compiles %s to the hand-verified atoms', (name) => {
    const expected = FIXTURES[name] ?? [];
    const program = compileBlock(readFixture(`python/${name}`), pythonAdapter, name);

    expect(program.atoms).toEqual(expected);
    expect(program.canonicalKeystrokes).toBe(countCanonicalKeystrokes(expected));
  });

  it.each(Object.keys(FIXTURES))('%s displays exactly its source (§3.2)', (name) => {
    const source = readFixture(`python/${name}`);
    const program = compileBlock(source, pythonAdapter, name);
    expect(render(program.atoms)).toBe(source.replace(/\n$/, ''));
  });
});
