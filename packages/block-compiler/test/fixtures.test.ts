import { countCanonicalKeystrokes, type Atom } from '@typing-trainer/contracts';
import { describe, expect, it } from 'vitest';

import { compileBlock, typescriptAdapter } from '../src';
import { A, L, NL, R, S, readFixture, render } from './helpers';

/**
 * Hand-verified atom sequences. Each literal is one lexer token (or one piece of a string or
 * template token); `R` marks separators whose tokens would fuse, `S` optional ones.
 *
 * Rows are grouped by source line with atom index ranges on the right, which is how they were
 * verified; Prettier would put every atom on its own line and lose that correspondence.
 */
// prettier-ignore
const FIXTURES: Record<string, Atom[]> = {
  'operators.ts': [
    // let total = count + +input;
    L('let'), R, L('total'), S, L('='), S, L('count'), S, L('+'),
    R, // `++` fuses
    L('+'), L('input'), L(';'), NL, //                                               0-13
    // let ratio = left < <number>right;
    L('let'), R, L('ratio'), S, L('='), S, L('left'), S, L('<'),
    R, // `<<` fuses
    L('<'), L('number'), L('>'), L('right'), L(';'), NL, //                          14-29
    // let delta = high - -low;
    L('let'), R, L('delta'), S, L('='), S, L('high'), S, L('-'),
    R, // `--` fuses
    L('-'), L('low'), L(';'), NL, //                                                 30-43
    // while (index-- > 0) {
    L('while'), S, L('('), L('index'), L('--'),
    S, // `-->` re-lexes to [--, >]
    L('>'), S, L('0'), A(')', 46), S, L('{'), NL, A('  ', 56), //                    44-57
    // total += 1;
    L('total'), S, L('+='), S, L('1'), L(';'), NL, //                                58-64
    // }
    A('}', 55), //                                                                   65
  ],

  'template.ts': [
    // const label = `id: ${user.id} (${count + 1})`;
    L('const'), R, L('label'), S, L('='), S, //                                      0-5
    L('`'), L('id: '), L('${'), L('user'), L('.'), L('id'), A('}', 8), //            6-12
    L(' ('), L('${'), L('count'), S, L('+'), S, L('1'), A('}', 14), //               13-20
    L(')'), A('`', 6), L(';'), NL, //                                                21-24
    // const nested = `a${`b${c}`}`;
    L('const'), R, L('nested'), S, L('='), S, //                                     25-30
    L('`'), L('a'), L('${'), L('`'), L('b'), L('${'), L('c'), //                     31-37
    A('}', 36), A('`', 34), A('}', 33), A('`', 31), L(';'), //                       38-42
  ],

  'generics.ts': [
    // function first<T>(items: Array<T>): T | undefined {
    L('function'), R, L('first'), L('<'), L('T'), L('>'), L('('), //                 0-6
    L('items'), L(':'), S, L('Array'), L('<'), L('T'), L('>'), A(')', 6), //         7-14
    L(':'), S, L('T'), S, L('|'), S, L('undefined'), S, L('{'), NL, A('  ', 24), //  15-25
    // const cache: Map<string, Array<number>> = new Map();
    L('const'), R, L('cache'), L(':'), S, L('Map'), L('<'), L('string'), L(','), //  26-34
    S, L('Array'), L('<'), L('number'), L('>'), L('>'), //                          35-40
    R, // `>=` fuses once `>` is rescanned (conservative, see analyzeSeparator)
    L('='), S, L('new'), R, L('Map'), L('('), A(')', 47), L(';'), NL, A('  ', 50), // 42-51
    // return items[0];
    L('return'), R, L('items'), L('['), L('0'), A(']', 55), L(';'), NL, //           52-59
    // }
    A('}', 23), //                                                                   60
  ],

  'strings.ts': [
    // const greeting = "hello, world";
    L('const'), R, L('greeting'), S, L('='), S, L('"'), L('hello, world'), A('"', 6),
    L(';'), NL, //                                                                   0-10
    // const quote = "don't";
    L('const'), R, L('quote'), S, L('='), S, L('"'), L("don't"), A('"', 17),
    L(';'), NL, //                                                                   11-21
    // const escaped = 'it\'s';
    L('const'), R, L('escaped'), S, L('='), S, L("'"), L("it\\'s"), A("'", 28),
    L(';'), //                                                                       22-31
  ],

  'identifiers.ts': [
    // export async function load(id: string) {
    L('export'), R, L('async'), R, L('function'), R, L('load'), L('('), //           0-7
    L('id'), L(':'), S, L('string'), A(')', 7), S, L('{'), NL, A('  ', 15), //       8-16
    // return typeof id === "string" && id in cache;
    L('return'), R, L('typeof'), R, L('id'), S, L('==='), S, //                      17-24
    L('"'), L('string'), A('"', 25), S, L('&&'), S, L('id'), R, L('in'), R, //       25-34
    L('cache'), L(';'), NL, //                                                       35-37
    // }
    A('}', 14), //                                                                   38
  ],

  'object-return.ts': [
    // function check() {
    L('function'), R, L('check'), L('('), A(')', 3), S, L('{'), NL, A('  ', 7), //   0-8
    // return { ok: true }        -- optional space, auto `}`, line break
    L('return'), S, L('{'), S, L('ok'), L(':'), S, L('true'), S, A('}', 11), NL, //  9-19
    // }                          -- a line holding only an auto `}`
    A('}', 6), NL, //                                                                20-21
    // export { check }           -- ends in an optional space and an auto `}`
    L('export'), S, L('{'), S, L('check'), S, A('}', 24), //                         22-28
  ],

  'regex.ts': [
    // const pattern = /[a-z]+\/(\d)/g;  -- brackets inside a regular expression are not paired
    L('const'), R, L('pattern'), S, L('='), S, L('/[a-z]+\\/(\\d)/g'), L(';'),
  ],

  'closers.ts': [
    // const sum = values.reduce((acc, v) => acc + v, 0);
    L('const'), R, L('sum'), S, L('='), S, L('values'), L('.'), L('reduce'), //      0-8
    L('('), L('('), L('acc'), L(','), S, L('v'), A(')', 10), //                      9-15
    S, L('=>'), S, L('acc'), S, L('+'), S, L('v'), L(','), S, L('0'), A(')', 9), //  16-27
    L(';'), NL, //                                                                   28-29
    // console.log(sum.toFixed(2));
    L('console'), L('.'), L('log'), L('('), L('sum'), L('.'), L('toFixed'), //       30-36
    L('('), L('2'), A(')', 37), A(')', 33), L(';'), //                               37-41
  ],

  'numbers.ts': [
    // const big = 10n * factor;
    L('const'), R, L('big'), S, L('='), S, L('10n'), S, L('*'), S, L('factor'),
    L(';'), NL, //                                                                   0-12
    // const has = 1 in table;
    L('const'), R, L('has'), S, L('='), S, L('1'), R, L('in'), R, L('table'),
    L(';'), NL, //                                                                   13-25
    // const fixed = 1 .toFixed(2);
    L('const'), R, L('fixed'), S, L('='), S, L('1'), R, L('.'), L('toFixed'),
    L('('), L('2'), A(')', 36), L(';'), NL, //                                       26-40
    // const mask = 0xff + 1_000 - .5;
    L('const'), R, L('mask'), S, L('='), S, L('0xff'), S, L('+'), S, L('1_000'),
    S, L('-'), S, L('.5'), L(';'), //                                                41-56
  ],
};

describe('TypeScript fixtures', () => {
  it.each(Object.keys(FIXTURES))('compiles %s to the hand-verified atoms', (name) => {
    const expected = FIXTURES[name] ?? [];
    const program = compileBlock(readFixture(name), typescriptAdapter, name);

    expect(program.atoms).toEqual(expected);
    expect(program.blockId).toBe(name);
    expect(program.canonicalKeystrokes).toBe(countCanonicalKeystrokes(expected));
  });

  it.each(Object.keys(FIXTURES))('%s displays exactly its source (§3.2)', (name) => {
    const source = readFixture(name);
    const program = compileBlock(source, typescriptAdapter, name);
    expect(render(program.atoms)).toBe(source.replace(/\n$/, ''));
  });
});
