import { countCanonicalKeystrokes, type Atom } from '@typing-trainer/contracts';
import { describe, expect, it } from 'vitest';

import { compileBlock, javaAdapter } from '../src';
import { A, L, NL, R, S, readFixture, render } from './helpers';

const I = (levels: number, filledBy: number) => A('  '.repeat(levels), filledBy);

/**
 * Hand-verified atom sequences for the Java fixtures (google-java-format, 2-space indentation).
 * `R` marks separators whose tokens would fuse, `S` optional ones, and `I(n, i)` n levels of
 * indentation filled by the line break at index i.
 */
// prettier-ignore
const FIXTURES: Record<string, Atom[]> = {
  'equals.java': [
    // @Override
    L('@'), L('Override'), NL, //                                                         0-2
    // public boolean equals(Object other) {
    L('public'), R, L('boolean'), R, L('equals'), L('('), L('Object'), R, L('other'), // 3-11
    A(')', 8), S, L('{'), NL, I(1, 15), //                                                12-16
    // if (this == other) {
    L('if'), S, L('('), L('this'), S, L('=='), S, L('other'), A(')', 19), S, L('{'), // 17-27
    NL, I(2, 28), //                                                                      28-29
    // return true;
    L('return'), R, L('true'), L(';'), NL, I(1, 34), //                                  30-35
    // }
    A('}', 27), NL, I(1, 37), //                                                          36-38
    // if (!(other instanceof Point that)) {
    L('if'), S, L('('), L('!'), L('('), L('other'), R, L('instanceof'), R, L('Point'), // 39-48
    R, L('that'), A(')', 43), A(')', 41), S, L('{'), NL, I(2, 55), //                    49-56
    // return false;
    L('return'), R, L('false'), L(';'), NL, I(1, 61), //                                 57-62
    // }
    A('}', 54), NL, I(1, 64), //                                                          63-65
    // return x == that.x && y == that.y;
    L('return'), R, L('x'), S, L('=='), S, L('that'), L('.'), L('x'), S, L('&&'), S, // 66-77
    L('y'), S, L('=='), S, L('that'), L('.'), L('y'), L(';'), NL, //                     78-86
    // }
    A('}', 14), //                                                                        87
  ],

  'streams.java': [
    // static List<String> nonEmptyTrimmed(List<String> lines) {
    L('static'), R, L('List'), L('<'), L('String'), L('>'), S, L('nonEmptyTrimmed'), //  0-7
    L('('), L('List'), L('<'), L('String'), L('>'), S, L('lines'), A(')', 8), S, //      8-16
    L('{'), NL, I(1, 18), //                                                              17-19
    // List<String> result = new ArrayList<>();   -- diamond: `<` and `>` are two tokens
    L('List'), L('<'), L('String'), L('>'), S, L('result'), S, L('='), S, L('new'), R, // 20-30
    L('ArrayList'), L('<'), L('>'), L('('), A(')', 34), L(';'), NL, I(1, 37), //         31-38
    // lines.stream().map(String::trim).filter(s -> !s.isEmpty()).forEach(result::add);
    L('lines'), L('.'), L('stream'), L('('), A(')', 42), L('.'), L('map'), L('('), //    39-46
    L('String'), L('::'), L('trim'), A(')', 46), L('.'), L('filter'), L('('), L('s'), // 47-54
    S, L('->'), S, L('!'), L('s'), L('.'), L('isEmpty'), L('('), A(')', 62), //          55-63
    A(')', 53), L('.'), L('forEach'), L('('), L('result'), L('::'), L('add'), //         64-70
    A(')', 67), L(';'), NL, I(1, 73), //                                                  71-74
    // return result;
    L('return'), R, L('result'), L(';'), NL, //                                           75-79
    // }
    A('}', 17), //                                                                        80
  ],

  'resources.java': [
    // static String firstLine(Path path) throws IOException {
    L('static'), R, L('String'), R, L('firstLine'), L('('), L('Path'), R, L('path'), //  0-8
    A(')', 5), S, L('throws'), R, L('IOException'), S, L('{'), NL, I(1, 16), //          9-17
    // try (BufferedReader reader = Files.newBufferedReader(path)) {
    L('try'), S, L('('), L('BufferedReader'), R, L('reader'), S, L('='), S, L('Files'), // 18-27
    L('.'), L('newBufferedReader'), L('('), L('path'), A(')', 30), A(')', 20), S, //     28-34
    L('{'), NL, I(2, 36), //                                                              35-37
    // return reader.readLine();
    L('return'), R, L('reader'), L('.'), L('readLine'), L('('), A(')', 43), L(';'), //   38-45
    NL, I(1, 46), //                                                                      46-47
    // } catch (UncheckedIOException | SecurityException e) {
    A('}', 35), S, L('catch'), S, L('('), L('UncheckedIOException'), S, L('|'), S, //    48-56
    L('SecurityException'), R, L('e'), A(')', 52), S, L('{'), NL, I(2, 63), //           57-64
    // throw new IOException("cannot read " + path, e);
    L('throw'), R, L('new'), R, L('IOException'), L('('), L('"'), L('cannot read '), //  65-72
    A('"', 71), S, L('+'), S, L('path'), L(','), S, L('e'), A(')', 70), L(';'), NL, //   73-83
    I(1, 83), //                                                                          84
    // }
    A('}', 62), NL, //                                                                    85-86
    // }
    A('}', 15), //                                                                        87
  ],

  'varargs.java': [
    // static double sum(List<? extends Number> values, int... extra) {
    L('static'), R, L('double'), R, L('sum'), L('('), L('List'), L('<'), L('?'), S, //   0-9
    L('extends'), R, L('Number'), L('>'), S, L('values'), L(','), S, L('int'), //        10-18
    L('...'), S, L('extra'), A(')', 5), S, L('{'), NL, I(1, 25), //                      19-26
    // double total = 0;
    L('double'), R, L('total'), S, L('='), S, L('0'), L(';'), NL, I(1, 35), //           27-36
    // for (Number value : values) {
    L('for'), S, L('('), L('Number'), R, L('value'), S, L(':'), S, L('values'), //       37-46
    A(')', 39), S, L('{'), NL, I(2, 50), //                                               47-51
    // total += value.doubleValue();
    L('total'), S, L('+='), S, L('value'), L('.'), L('doubleValue'), L('('), //          52-59
    A(')', 59), L(';'), NL, I(1, 62), //                                                  60-63
    // }
    A('}', 49), NL, I(1, 65), //                                                          64-66
    // for (int n : extra) {
    L('for'), S, L('('), L('int'), R, L('n'), S, L(':'), S, L('extra'), A(')', 69), //  67-77
    S, L('{'), NL, I(2, 80), //                                                           78-81
    // total += n;
    L('total'), S, L('+='), S, L('n'), L(';'), NL, I(1, 88), //                          82-89
    // }
    A('}', 79), NL, I(1, 91), //                                                          90-92
    // return total;
    L('return'), R, L('total'), L(';'), NL, //                                            93-97
    // }
    A('}', 24), //                                                                        98
  ],

  'switch.java': [
    // static int score(String grade) {
    L('static'), R, L('int'), R, L('score'), L('('), L('String'), R, L('grade'), //      0-8
    A(')', 5), S, L('{'), NL, I(1, 12), //                                                9-13
    // return switch (grade) {
    L('return'), R, L('switch'), S, L('('), L('grade'), A(')', 18), S, L('{'), NL, //    14-23
    I(2, 23), //                                                                          24
    // case "A", "B" -> 2;
    L('case'), S, L('"'), L('A'), A('"', 27), L(','), S, L('"'), L('B'), A('"', 32), // 25-34
    S, L('->'), S, L('2'), L(';'), NL, I(2, 40), //                                      35-41
    // case "C" -> {
    L('case'), S, L('"'), L('C'), A('"', 44), S, L('->'), S, L('{'), NL, I(3, 51), //   42-52
    // int base = 1;
    L('int'), R, L('base'), S, L('='), S, L('1'), L(';'), NL, I(3, 61), //               53-62
    // yield base;
    L('yield'), R, L('base'), L(';'), NL, I(2, 67), //                                   63-68
    // }
    A('}', 50), NL, I(2, 70), //                                                          69-71
    // default -> 0;
    L('default'), S, L('->'), S, L('0'), L(';'), NL, I(1, 78), //                        72-79
    // };
    A('}', 22), L(';'), NL, //                                                            80-82
    // }
    A('}', 11), //                                                                        83
  ],

  'literals.java': [
    // static Object[] literals() {
    L('static'), R, L('Object'), L('['), A(']', 3), S, L('literals'), L('('), //         0-7
    A(')', 7), S, L('{'), NL, I(1, 11), //                                                8-12
    // return new Object[] {1_000L, 0x1Fp3, 1.5f, 'x', '\n', "tab\tstop", 0b1010, 017, .5e-3};
    L('return'), R, L('new'), R, L('Object'), L('['), A(']', 18), S, L('{'), //         13-21
    L('1_000L'), L(','), S, L('0x1Fp3'), L(','), S, L('1.5f'), L(','), S, //             22-30
    L("'"), L('x'), A("'", 31), L(','), S, //                                            31-35
    L("'"), L('\\n'), A("'", 36), L(','), S, //                                          36-40
    L('"'), L('tab\\tstop'), A('"', 41), L(','), S, //                                   41-45
    L('0b1010'), L(','), S, L('017'), L(','), S, L('.5e-3'), A('}', 21), L(';'), NL, //  46-55
    // }
    A('}', 10), //                                                                        56
  ],

  'nested-generics.java': [
    // static Map<String, List<Integer>> group(List<String> words) {   -- `>>` is one token
    L('static'), R, L('Map'), L('<'), L('String'), L(','), S, L('List'), L('<'), //      0-8
    L('Integer'), L('>>'), S, L('group'), L('('), L('List'), L('<'), L('String'), //     9-16
    L('>'), S, L('words'), A(')', 13), S, L('{'), NL, I(1, 23), //                       17-24
    // Map<String, List<Integer>> lengths = new HashMap<>();
    L('Map'), L('<'), L('String'), L(','), S, L('List'), L('<'), L('Integer'), //       25-32
    L('>>'), S, L('lengths'), S, L('='), S, L('new'), R, L('HashMap'), L('<'), //        33-42
    L('>'), L('('), A(')', 44), L(';'), NL, I(1, 47), //                                  43-48
    // for (String word : words) {
    L('for'), S, L('('), L('String'), R, L('word'), S, L(':'), S, L('words'), //         49-58
    A(')', 51), S, L('{'), NL, I(2, 62), //                                               59-63
    // lengths.computeIfAbsent(word.substring(0, 1), key -> new ArrayList<>()).add(word.length());
    L('lengths'), L('.'), L('computeIfAbsent'), L('('), L('word'), L('.'), //            64-69
    L('substring'), L('('), L('0'), L(','), S, L('1'), A(')', 71), L(','), S, L('key'), // 70-79
    S, L('->'), S, L('new'), R, L('ArrayList'), L('<'), L('>'), L('('), A(')', 88), //   80-89
    A(')', 67), L('.'), L('add'), L('('), L('word'), L('.'), L('length'), L('('), //    90-97
    A(')', 97), A(')', 93), L(';'), NL, I(1, 101), //                                    98-102
    // }
    A('}', 61), NL, I(1, 104), //                                                         103-105
    // return lengths;
    L('return'), R, L('lengths'), L(';'), NL, //                                          106-110
    // }
    A('}', 22), //                                                                        111
  ],
};

describe('Java fixtures', () => {
  it.each(Object.keys(FIXTURES))('compiles %s to the hand-verified atoms', (name) => {
    const expected = FIXTURES[name] ?? [];
    const program = compileBlock(readFixture(`java/${name}`), javaAdapter, name);

    expect(program.atoms).toEqual(expected);
    expect(program.canonicalKeystrokes).toBe(countCanonicalKeystrokes(expected));
  });

  it.each(Object.keys(FIXTURES))('%s displays exactly its source (§3.2)', (name) => {
    const source = readFixture(`java/${name}`);
    const program = compileBlock(source, javaAdapter, name);
    expect(render(program.atoms)).toBe(source.replace(/\n$/, ''));
  });
});
