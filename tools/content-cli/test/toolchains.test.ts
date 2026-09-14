import { afterEach, describe, expect, it } from 'vitest';

import {
  ToolchainUnavailableError,
  pythonStdlibDiagnostics,
  toolchainDiagnostics,
  toolchainVersions,
  type ContentDiagnostic,
} from '../src';

/**
 * These tests call gofmt, java with google-java-format, black, and python3.12. They run only with
 * CONTENT_TOOLCHAINS=1, as in the content CI job; the regular CI job has no toolchains.
 */
const enabled = process.env.CONTENT_TOOLCHAINS === '1';

const codes = (diagnostics: readonly ContentDiagnostic[]) =>
  diagnostics.map((d) => `${d.file} ${d.stage}/${d.code}@${String(d.line)}`);

const lines = (...text: string[]) => `${text.join('\n')}\n`;

describe('toolchain availability', () => {
  const saved = process.env.GOFMT;
  afterEach(() => {
    if (saved === undefined) delete process.env.GOFMT;
    else process.env.GOFMT = saved;
  });

  it('reports a missing tool with a clear error instead of passing silently', () => {
    process.env.GOFMT = 'gofmt-that-does-not-exist';
    expect(() =>
      toolchainDiagnostics('go', [{ file: 'go/a.go', source: 'func f() {}\n' }]),
    ).toThrow(ToolchainUnavailableError);
  });
});

describe.runIf(enabled)('toolchain checks (CONTENT_TOOLCHAINS=1)', () => {
  it('accepts gofmt output and rejects unformatted or unparsable Go', () => {
    const valid = lines(
      'func add(a, b int) int {',
      '\tsum := a + b',
      '\tsum++',
      '\treturn sum',
      '}',
    );
    expect(
      codes(
        toolchainDiagnostics('go', [
          { file: 'go/valid.go', source: valid },
          { file: 'go/spacing.go', source: valid.replace('sum := a + b', 'sum:=a+b') },
          // tree-sitter misses this; gofmt reports it.
          { file: 'go/brace.go', source: lines('func f()', '{', '}') },
        ]),
      ),
    ).toEqual(['go/spacing.go format/not-formatted@1', 'go/brace.go toolchain/gofmt@2']);
  });

  it('accepts the Java literal 1__0 that tree-sitter wrongly rejects', () => {
    // Paired with the tree-sitter test in pipeline.test.ts: javac parses this block and
    // google-java-format reproduces it, so the block is valid despite the tree-sitter ERROR node.
    const underscores = lines(
      'static int underscores() {',
      '  int value = 1__0;',
      '  value += 2;',
      '  value *= 3;',
      '  return value;',
      '}',
    );
    expect(
      toolchainDiagnostics('java', [{ file: 'java/underscores.java', source: underscores }]),
    ).toEqual([]);
  });

  it('rejects unparsable or unformatted Java with positions inside the block', () => {
    expect(
      codes(
        toolchainDiagnostics('java', [
          {
            file: 'java/chars.java',
            source: lines('static char first() {', "  char value = 'ab';", '  return value;', '}'),
          },
          { file: 'java/spacing.java', source: lines('static int one() {', '  return   1;', '}') },
        ]),
      ),
    ).toEqual(['java/chars.java toolchain/javac@2', 'java/spacing.java format/not-formatted@1']);
  });

  it('rejects Python that only the compiler catches, and non-black output', () => {
    expect(
      codes(
        toolchainDiagnostics('python', [
          { file: 'python/valid.py', source: lines('def one():', '    return 1') },
          // tree-sitter accepts both of these.
          { file: 'python/zero.py', source: lines('def one():', '    return 01') },
          { file: 'python/keyword.py', source: lines('def pick(y):', '    return 1if y else 2') },
          { file: 'python/spacing.py', source: lines('def one():', '    return  1') },
        ]),
      ),
    ).toEqual([
      'python/zero.py toolchain/python@2',
      'python/keyword.py toolchain/python@2',
      'python/spacing.py format/not-formatted@1',
    ]);
  });

  it('keeps the pinned Python standard library list in sync with Python 3.12', () => {
    expect(pythonStdlibDiagnostics()).toEqual([]);
  });

  it('records the versions of every tool', () => {
    const versions = toolchainVersions();
    expect(Object.keys(versions).sort()).toEqual([
      'black',
      'go',
      'googleJavaFormat',
      'java',
      'python',
    ]);
    for (const value of Object.values(versions)) expect(value).not.toBe('');
  });
});
