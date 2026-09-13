import { countCanonicalKeystrokes, type Atom } from '@typing-trainer/contracts';
import { describe, expect, it } from 'vitest';

import { compileBlock, goAdapter, normalizeIndentation } from '../src';
import { A, L, NL, R, S, readFixture, render } from './helpers';

const P = (text: string): Atom => ({ kind: 'padding', text });
const I = (levels: number, filledBy: number) => A('    '.repeat(levels), filledBy);

/**
 * Hand-verified atom sequences for the Go fixtures after normalizeIndentation (tab width 4).
 * `R` marks separators whose tokens would fuse, `S` optional ones, `P` gofmt alignment padding,
 * and `I(n, i)` n levels of indentation filled by the line break at index i.
 */
// prettier-ignore
const FIXTURES: Record<string, Atom[]> = {
  'composite.go': [
    // func defaults() map[string][]int {
    L('func'), R, L('defaults'), L('('), A(')', 3), S, L('map'), L('['), L('string'), //  0-8
    A(']', 7), L('['), A(']', 10), L('int'), S, L('{'), NL, I(1, 15), //                  9-16
    // type limit struct {
    L('type'), R, L('limit'), R, L('struct'), S, L('{'), NL, I(2, 24), //                 17-25
    // Name string
    L('Name'), R, L('string'), NL, I(2, 29), //                                           26-30
    // Max  int                 -- padding before a required separator
    L('Max'), P(' '), R, L('int'), NL, I(1, 35), //                                       31-36
    // }
    A('}', 23), NL, I(1, 38), //                                                          37-39
    // limits := []limit{{Name: "cpu", Max: 4}, {Name: "memory", Max: 512}}
    L('limits'), S, L(':='), S, L('['), A(']', 44), L('limit'), L('{'), L('{'), //       40-48
    L('Name'), L(':'), S, L('"'), L('cpu'), A('"', 52), L(','), S, L('Max'), L(':'), //  49-58
    S, L('4'), A('}', 48), L(','), S, L('{'), L('Name'), L(':'), S, L('"'), //           59-68
    L('memory'), A('"', 68), L(','), S, L('Max'), L(':'), S, L('512'), A('}', 64), //    69-77
    A('}', 47), NL, I(1, 79), //                                                          78-80
    // sizes := map[string][]int{
    L('sizes'), S, L(':='), S, L('map'), L('['), L('string'), A(']', 86), L('['), //     81-89
    A(']', 89), L('int'), L('{'), NL, I(2, 93), //                                        90-94
    // "small":  {1, 2},        -- padding after `:`
    L('"'), L('small'), A('"', 95), L(':'), P(' '), S, L('{'), L('1'), L(','), S, //     95-104
    L('2'), A('}', 101), L(','), NL, I(2, 108), //                                        105-109
    // "medium": {4, 8, 16},
    L('"'), L('medium'), A('"', 110), L(':'), S, L('{'), L('4'), L(','), S, L('8'), //  110-119
    L(','), S, L('16'), A('}', 115), L(','), NL, I(2, 125), //                           120-126
    // "none":   {},            -- two spaces of padding, empty composite literal
    L('"'), L('none'), A('"', 127), L(':'), P('  '), S, L('{'), A('}', 133), L(','), // 127-135
    NL, I(1, 136), //                                                                     136-137
    // }
    A('}', 92), NL, I(1, 139), //                                                         138-140
    // for _, l := range limits {
    L('for'), R, L('_'), L(','), S, L('l'), S, L(':='), S, L('range'), R, L('limits'), // 141-152
    S, L('{'), NL, I(2, 155), //                                                          153-156
    // sizes[l.Name] = []int{l.Max}
    L('sizes'), L('['), L('l'), L('.'), L('Name'), A(']', 158), S, L('='), S, L('['), // 157-166
    A(']', 166), L('int'), L('{'), L('l'), L('.'), L('Max'), A('}', 169), NL, I(1, 174), // 167-175
    // }
    A('}', 154), NL, I(1, 177), //                                                        176-178
    // return sizes
    L('return'), R, L('sizes'), NL, //                                                    179-182
    // }
    A('}', 14), //                                                                        183
  ],

  'if-else.go': [
    // func sign(n int) string {
    L('func'), R, L('sign'), L('('), L('n'), R, L('int'), A(')', 3), S, L('string'), //  0-9
    S, L('{'), NL, I(1, 12), //                                                           10-13
    // if n > 0 {
    L('if'), R, L('n'), S, L('>'), S, L('0'), S, L('{'), NL, I(2, 23), //                14-24
    // return "positive"
    L('return'), S, L('"'), L('positive'), A('"', 27), NL, I(1, 30), //                  25-31
    // } else if n < 0 {
    A('}', 22), S, L('else'), R, L('if'), R, L('n'), S, L('<'), S, L('0'), S, //        32-43
    L('{'), NL, I(2, 45), //                                                              44-46
    // return "negative"
    L('return'), S, L('"'), L('negative'), A('"', 49), NL, I(1, 52), //                  47-53
    // } else {
    A('}', 44), S, L('else'), S, L('{'), NL, I(2, 59), //                                54-60
    // return "zero"
    L('return'), S, L('"'), L('zero'), A('"', 63), NL, I(1, 66), //                      61-67
    // }
    A('}', 58), NL, //                                                                    68-69
    // }
    A('}', 11), //                                                                        70
  ],

  'multi-return.go': [
    // func divide(a, b int) (int, error) {
    L('func'), R, L('divide'), L('('), L('a'), L(','), S, L('b'), R, L('int'), //       0-9
    A(')', 3), S, L('('), L('int'), L(','), S, L('error'), A(')', 12), S, L('{'), //    10-19
    NL, I(1, 20), //                                                                      20-21
    // if b == 0 {
    L('if'), R, L('b'), S, L('=='), S, L('0'), S, L('{'), NL, I(2, 31), //              22-32
    // return 0, errors.New("division by zero")
    L('return'), R, L('0'), L(','), S, L('errors'), L('.'), L('New'), L('('), //       33-41
    L('"'), L('division by zero'), A('"', 42), A(')', 41), NL, I(1, 46), //             42-47
    // }
    A('}', 30), NL, I(1, 49), //                                                          48-50
    // q, r := a/b, a%b         -- gofmt drops the spaces around / and %
    L('q'), L(','), S, L('r'), S, L(':='), S, L('a'), L('/'), L('b'), L(','), S, //     51-62
    L('a'), L('%'), L('b'), NL, I(1, 66), //                                              63-67
    // return q + r, nil
    L('return'), R, L('q'), S, L('+'), S, L('r'), L(','), S, L('nil'), NL, //          68-78
    // }
    A('}', 19), //                                                                        79
  ],

  'goroutine.go': [
    // func sumSquares(values []int) int {
    L('func'), R, L('sumSquares'), L('('), L('values'), S, L('['), A(']', 6), //       0-7
    L('int'), A(')', 3), S, L('int'), S, L('{'), NL, I(1, 14), //                        8-15
    // var wg sync.WaitGroup
    L('var'), R, L('wg'), R, L('sync'), L('.'), L('WaitGroup'), NL, I(1, 23), //        16-24
    // results := make(chan int, len(values))
    L('results'), S, L(':='), S, L('make'), L('('), L('chan'), R, L('int'), L(','), // 25-34
    S, L('len'), L('('), L('values'), A(')', 37), A(')', 30), NL, I(1, 41), //          35-42
    // for _, v := range values {
    L('for'), R, L('_'), L(','), S, L('v'), S, L(':='), S, L('range'), R, L('values'), // 43-54
    S, L('{'), NL, I(2, 57), //                                                           55-58
    // wg.Add(1)
    L('wg'), L('.'), L('Add'), L('('), L('1'), A(')', 62), NL, I(2, 65), //              59-66
    // go func(n int) {
    L('go'), R, L('func'), L('('), L('n'), R, L('int'), A(')', 70), S, L('{'), NL, //   67-77
    I(3, 77), //                                                                          78
    // defer wg.Done()
    L('defer'), R, L('wg'), L('.'), L('Done'), L('('), A(')', 84), NL, I(3, 86), //     79-87
    // results <- n * n
    L('results'), S, L('<-'), S, L('n'), S, L('*'), S, L('n'), NL, I(2, 97), //         88-98
    // }(v)                     -- auto `}` directly followed by a literal `(`
    A('}', 76), L('('), L('v'), A(')', 100), NL, I(1, 103), //                           99-104
    // }
    A('}', 56), NL, I(1, 106), //                                                         105-107
    // wg.Wait()
    L('wg'), L('.'), L('Wait'), L('('), A(')', 111), NL, I(1, 113), //                   108-114
    // close(results)
    L('close'), L('('), L('results'), A(')', 116), NL, I(1, 119), //                     115-120
    // sum := 0
    L('sum'), S, L(':='), S, L('0'), NL, I(1, 126), //                                   121-127
    // for r := range results {
    L('for'), R, L('r'), S, L(':='), S, L('range'), R, L('results'), S, L('{'), NL, // 128-139
    I(2, 139), //                                                                         140
    // sum += r
    L('sum'), S, L('+='), S, L('r'), NL, I(1, 146), //                                   141-147
    // }
    A('}', 138), NL, I(1, 149), //                                                        148-150
    // return sum
    L('return'), R, L('sum'), NL, //                                                      151-154
    // }
    A('}', 13), //                                                                        155
  ],

  'defer.go': [
    // func safeDivide(a, b int) (result int, err error) {
    L('func'), R, L('safeDivide'), L('('), L('a'), L(','), S, L('b'), R, L('int'), //   0-9
    A(')', 3), S, L('('), L('result'), R, L('int'), L(','), S, L('err'), R, //          10-19
    L('error'), A(')', 12), S, L('{'), NL, I(1, 24), //                                  20-25
    // defer func() {
    L('defer'), R, L('func'), L('('), A(')', 29), S, L('{'), NL, I(2, 33), //           26-34
    // if r := recover(); r != nil {
    L('if'), R, L('r'), S, L(':='), S, L('recover'), L('('), A(')', 42), L(';'), S, //  35-45
    L('r'), S, L('!='), S, L('nil'), S, L('{'), NL, I(3, 53), //                         46-54
    // err = fmt.Errorf("recovered: %v", r)
    L('err'), S, L('='), S, L('fmt'), L('.'), L('Errorf'), L('('), L('"'), //           55-63
    L('recovered: %v'), A('"', 63), L(','), S, L('r'), A(')', 62), NL, I(2, 70), //    64-71
    // }
    A('}', 52), NL, I(1, 73), //                                                          72-74
    // }()                      -- auto `}` directly followed by a literal `(`
    A('}', 32), L('('), A(')', 76), NL, I(1, 78), //                                     75-79
    // return a / b, nil
    L('return'), R, L('a'), S, L('/'), S, L('b'), L(','), S, L('nil'), NL, //          80-90
    // }
    A('}', 23), //                                                                        91
  ],

  'operators.go': [
    // func bits(a, b uint8, ch chan uint8) uint8 {
    L('func'), R, L('bits'), L('('), L('a'), L(','), S, L('b'), R, L('uint8'), L(','), // 0-10
    S, L('ch'), R, L('chan'), R, L('uint8'), A(')', 3), S, L('uint8'), S, L('{'), //    11-21
    NL, I(1, 22), //                                                                      22-23
    // mask := a &^ b
    L('mask'), S, L(':='), S, L('a'), S, L('&^'), S, L('b'), NL, I(1, 33), //           24-34
    // a <<= 1
    L('a'), S, L('<<='), S, L('1'), NL, I(1, 40), //                                     35-41
    // b--
    L('b'), L('--'), NL, I(1, 44), //                                                     42-45
    // v := <-ch
    L('v'), S, L(':='), S, L('<-'), L('ch'), NL, I(1, 52), //                            46-53
    // return a<<2 | b + mask - -v
    L('return'), R, L('a'), L('<<'), L('2'), S, L('|'), S, L('b'), S, L('+'), S, //    54-65
    L('mask'), S, L('-'),
    R, // `--` fuses
    L('-'), L('v'), NL, //                                                                70-72
    // }
    A('}', 21), //                                                                        73
  ],

  'literals.go': [
    // func literals() []any {
    L('func'), R, L('literals'), L('('), A(')', 3), S, L('['), A(']', 6), L('any'), //  0-8
    S, L('{'), NL, I(1, 11), //                                                           9-12
    // return []any{'x', '\n', "tab\tstop", `C:\dir`, 0x_FF, 1_000, 1e3, .5, 2i, 0b1010, 0o17}
    L('return'), S, L('['), A(']', 15), L('any'), L('{'), //                             13-18
    L("'"), L('x'), A("'", 19), L(','), S, //                                            19-23
    L("'"), L('\\n'), A("'", 24), L(','), S, //                                          24-28
    L('"'), L('tab\\tstop'), A('"', 29), L(','), S, //                                   29-33
    L('`'), L('C:\\dir'), A('`', 34), L(','), S, //                                      34-38
    L('0x_FF'), L(','), S, L('1_000'), L(','), S, L('1e3'), L(','), S, L('.5'), //      39-48
    L(','), S, L('2i'), L(','), S, L('0b1010'), L(','), S, L('0o17'), A('}', 18), //    49-58
    NL, //                                                                                59
    // }
    A('}', 10), //                                                                        60
  ],

  'generics.go': [
    // func Map[T, U any](xs []T, f func(T) U) []U {
    L('func'), R, L('Map'), L('['), L('T'), L(','), S, L('U'), R, L('any'), //           0-9
    A(']', 3), L('('), L('xs'), S, L('['), A(']', 14), L('T'), L(','), S, L('f'), //    10-19
    R, L('func'), L('('), L('T'), A(')', 22), S, L('U'), A(')', 11), S, L('['), //      20-29
    A(']', 29), L('U'), S, L('{'), NL, I(1, 34), //                                      30-35
    // out := make([]U, 0, len(xs))
    L('out'), S, L(':='), S, L('make'), L('('), L('['), A(']', 42), L('U'), L(','), //  36-45
    S, L('0'), L(','), S, L('len'), L('('), L('xs'), A(')', 51), A(')', 41), NL, //    46-55
    I(1, 55), //                                                                          56
    // for _, x := range xs {
    L('for'), R, L('_'), L(','), S, L('x'), S, L(':='), S, L('range'), R, L('xs'), //   57-68
    S, L('{'), NL, I(2, 71), //                                                           69-72
    // out = append(out, f(x))
    L('out'), S, L('='), S, L('append'), L('('), L('out'), L(','), S, L('f'), //        73-82
    L('('), L('x'), A(')', 83), A(')', 78), NL, I(1, 87), //                             83-88
    // }
    A('}', 70), NL, I(1, 90), //                                                          89-91
    // return out
    L('return'), R, L('out'), NL, //                                                      92-95
    // }
    A('}', 33), //                                                                        96
  ],

  'switch.go': [
    // func describe(x any) string {
    L('func'), R, L('describe'), L('('), L('x'), R, L('any'), A(')', 3), S, //          0-8
    L('string'), S, L('{'), NL, I(1, 12), //                                             9-13
    // switch v := x.(type) {   -- gofmt keeps `case` at the `switch` level
    L('switch'), R, L('v'), S, L(':='), S, L('x'), L('.'), L('('), L('type'), //        14-23
    A(')', 22), S, L('{'), NL, I(1, 27), //                                              24-28
    // case int:
    L('case'), R, L('int'), L(':'), NL, I(2, 33), //                                     29-34
    // return fmt.Sprintf("int %d", v)
    L('return'), R, L('fmt'), L('.'), L('Sprintf'), L('('), L('"'), L('int %d'), //    35-42
    A('"', 41), L(','), S, L('v'), A(')', 40), NL, I(1, 48), //                          43-49
    // case string:
    L('case'), R, L('string'), L(':'), NL, I(2, 54), //                                  50-55
    // return "string " + v
    L('return'), S, L('"'), L('string '), A('"', 58), S, L('+'), S, L('v'), NL, //     56-65
    I(1, 65), //                                                                          66
    // default:
    L('default'), L(':'), NL, I(2, 69), //                                               67-70
    // return "unknown"
    L('return'), S, L('"'), L('unknown'), A('"', 73), NL, I(1, 76), //                  71-77
    // }
    A('}', 26), NL, //                                                                    78-79
    // }
    A('}', 11), //                                                                        80
  ],
};

describe('Go fixtures', () => {
  it.each(Object.keys(FIXTURES))('compiles %s to the hand-verified atoms', (name) => {
    const expected = FIXTURES[name] ?? [];
    const source = normalizeIndentation(readFixture(`go/${name}`), { tabWidth: 4 });
    const program = compileBlock(source, goAdapter, name);

    expect(program.atoms).toEqual(expected);
    expect(program.canonicalKeystrokes).toBe(countCanonicalKeystrokes(expected));
  });

  it.each(Object.keys(FIXTURES))('%s displays exactly its normalized source (§3.2)', (name) => {
    const source = normalizeIndentation(readFixture(`go/${name}`), { tabWidth: 4 });
    const program = compileBlock(source, goAdapter, name);
    expect(render(program.atoms)).toBe(source.replace(/\n$/, ''));
  });
});
