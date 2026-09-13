import type { Atom, TypingProgram } from '@typing-trainer/contracts';

const L = (text: string): Atom => ({ kind: 'literal', text });
const A = (text: string, filledBy: number): Atom => ({ kind: 'auto', text, filledBy });
/** Optional in-line space. */
const S: Atom = { kind: 'separator', canonical: ' ', required: false };
/** Required in-line space. */
const R: Atom = { kind: 'separator', canonical: ' ', required: true };
const NL: Atom = { kind: 'separator', canonical: '\n', required: true };

/**
 * Hand-written typing program for apps/web/test/fixtures/p0-demo.ts, verified against the
 * block compiler's output in apps/web/test/demo-program.test.ts. Atom index ranges on the right.
 */
// prettier-ignore
const atoms: Atom[] = [
  // export function summarize(rows: Array<Array<number>>): string {
  L('export'), R, L('function'), R, L('summarize'), L('('), L('rows'), L(':'), S, //   0-8
  L('Array'), L('<'), L('Array'), L('<'), L('number'), L('>'), L('>'), A(')', 5), //   9-16
  L(':'), S, L('string'), S, L('{'), NL, A('  ', 22), //                               17-23
  // const totals: Map<string, number> = new Map();
  L('const'), R, L('totals'), L(':'), S, L('Map'), L('<'), L('string'), L(','), S, // 24-33
  L('number'), L('>'),
  R, // `>=` once `>` is rescanned
  L('='), S, L('new'), R, L('Map'), L('('), A(')', 42), L(';'), NL, A('  ', 45), //   34-46
  // for (const [index, row] of rows.entries()) {
  L('for'), S, L('('), L('const'), S, L('['), L('index'), L(','), S, L('row'), //     47-56
  A(']', 52), S, L('of'), R, L('rows'), L('.'), L('entries'), L('('), A(')', 64), //  57-65
  A(')', 49), S, L('{'), NL, A('    ', 69), //                                          66-70
  // totals.set(`row ${index}`, row.reduce((sum, value) => sum + value, 0));
  L('totals'), L('.'), L('set'), L('('), L('`'), L('row '), L('${'), L('index'), //   71-78
  A('}', 77), A('`', 75), L(','), S, L('row'), L('.'), L('reduce'), L('('), //        79-86
  L('('), L('sum'), L(','), S, L('value'), A(')', 87), S, L('=>'), S, L('sum'), //    87-96
  S, L('+'), S, L('value'), L(','), S, L('0'), A(')', 86), A(')', 74), L(';'), //     97-106
  NL, A('  ', 107), //                                                                 107-108
  // }
  A('}', 68), NL, A('  ', 110), //                                                     109-111
  // if (totals.size === 0) {
  L('if'), S, L('('), L('totals'), L('.'), L('size'), S, L('==='), S, L('0'), //      112-121
  A(')', 114), S, L('{'), NL, A('    ', 125), //                                        122-126
  // return "no rows";
  L('return'), S, L('"'), L('no rows'), A('"', 129), L(';'), NL, A('  ', 133), //     127-134
  // } else {
  A('}', 124), S, L('else'), S, L('{'), NL, A('    ', 140), //                        135-141
  // return [...totals].map(([key, total]) => `${key}: ${total}`).join(", ");
  L('return'), S, L('['), L('...'), L('totals'), A(']', 144), L('.'), L('map'), //   142-149
  L('('), L('('), L('['), L('key'), L(','), S, L('total'), A(']', 152), //            150-157
  A(')', 151), S, L('=>'), S, L('`'), L('${'), L('key'), A('}', 163), L(': '), //     158-166
  L('${'), L('total'), A('}', 167), A('`', 162), A(')', 150), L('.'), L('join'), //   167-173
  L('('), L('"'), L(', '), A('"', 175), A(')', 174), L(';'), NL, A('  ', 180), //     174-181
  // }
  A('}', 139), NL, //                                                                  182-183
  // }
  A('}', 21), //                                                                       184
];

export const DEMO_PROGRAM: TypingProgram = {
  blockId: 'p0-demo',
  atoms,
  // Literal characters plus separators, per source line:
  // 63 + 46 + 42 + 67 + 1 + 24 + 17 + 8 + 64 + 1 + 0.
  canonicalKeystrokes: 333,
};
