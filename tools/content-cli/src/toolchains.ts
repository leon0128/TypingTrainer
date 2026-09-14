import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ContentLanguage } from '@typing-trainer/contracts';

import { PYTHON_STDLIB } from './constraints';
import type { ContentDiagnostic } from './diagnostics';

/**
 * Stage 2 (formatter equality) and stage 3 (syntax) with each language's own toolchain (§5.2).
 * TypeScript needs no external tool and is checked in the toolchain-free stages. Commands can be
 * overridden with GOFMT, GOOGLE_JAVA_FORMAT_JAR (run with JAVA), JAVA, BLACK, and PYTHON.
 */

export interface ToolchainBlock {
  /** Path relative to the repository root, used in diagnostics. */
  readonly file: string;
  readonly source: string;
}

export class ToolchainUnavailableError extends Error {
  constructor(program: string) {
    super(
      `${program} was not found; pnpm content:build needs gofmt, java with google-java-format, black, and python3.12 (see docs/requirements.md §5.2)`,
    );
    this.name = 'ToolchainUnavailableError';
  }
}

interface Command {
  readonly program: string;
  readonly args: readonly string[];
}

const commands = {
  gofmt: (): Command => ({ program: process.env.GOFMT ?? 'gofmt', args: [] }),
  java: (): Command => ({ program: process.env.JAVA ?? 'java', args: [] }),
  googleJavaFormat: (): Command => {
    const jar = process.env.GOOGLE_JAVA_FORMAT_JAR;
    return jar === undefined
      ? { program: 'google-java-format', args: [] }
      : { program: process.env.JAVA ?? 'java', args: ['-jar', jar] };
  },
  black: (): Command => ({ program: process.env.BLACK ?? 'black', args: [] }),
  python: (): Command => ({ program: process.env.PYTHON ?? 'python3.12', args: [] }),
};

const HELPERS = fileURLToPath(new URL('../toolchains/', import.meta.url));

interface RunResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

function run(command: Command, args: readonly string[], input?: string): RunResult {
  const result = spawnSync(command.program, [...command.args, ...args], {
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ToolchainUnavailableError(command.program);
    }
    throw result.error;
  }
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

function withTempDir<T>(action: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'content-toolchain-'));
  try {
    return action(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const diagnostic = (
  file: string,
  stage: 'format' | 'toolchain',
  code: string,
  message: string,
  line = 1,
  column = 1,
): ContentDiagnostic => ({
  file,
  line: Math.max(1, line),
  column: Math.max(1, column),
  stage,
  code,
  message,
});

export function toolchainDiagnostics(
  language: ContentLanguage,
  blocks: readonly ToolchainBlock[],
): ContentDiagnostic[] {
  if (blocks.length === 0) return [];
  switch (language) {
    case 'typescript':
      return [];
    case 'go':
      return blocks.flatMap(goDiagnostics);
    case 'java':
      return javaDiagnostics(blocks);
    case 'python':
      return pythonDiagnostics(blocks);
  }
}

/** gofmt formats declaration fragments only from standard input, so each block is piped in. */
function goDiagnostics({ file, source }: ToolchainBlock): ContentDiagnostic[] {
  const result = run(commands.gofmt(), ['-e'], source);
  if (result.status !== 0) {
    const errors = [...result.stderr.matchAll(/^<standard input>:(\d+):(\d+): (.*)$/gm)];
    if (errors.length === 0) {
      return [diagnostic(file, 'toolchain', 'gofmt', result.stderr.trim() || 'gofmt failed')];
    }
    return errors.map(([, line, column, message]) =>
      diagnostic(file, 'toolchain', 'gofmt', message ?? '', Number(line), Number(column)),
    );
  }
  return result.stdout === source
    ? []
    : [diagnostic(file, 'format', 'not-formatted', 'differs from gofmt output')];
}

const JAVA_WRAPPER_OPEN = 'class Wrapper {';

const wrapJava = (member: string): string =>
  `${JAVA_WRAPPER_OPEN}\n${member
    .split('\n')
    .map((line) => (line === '' ? '' : `  ${line}`))
    .join('\n')}}\n`;

function unwrapJava(formatted: string): string | undefined {
  const lines = formatted.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines[0] !== JAVA_WRAPPER_OPEN || lines.at(-1) !== '}') return undefined;
  const body = lines.slice(1, -1);
  if (body.some((line) => line !== '' && !line.startsWith('  '))) return undefined;
  return `${body.map((line) => line.slice(2)).join('\n')}\n`;
}

/**
 * Java blocks are single members, so each is wrapped in a class: javac parses them (without
 * resolving symbols, which fragments cannot satisfy) and google-java-format must reproduce them
 * once unwrapped.
 */
function javaDiagnostics(blocks: readonly ToolchainBlock[]): ContentDiagnostic[] {
  return withTempDir((dir) => {
    const paths = blocks.map(({ file, source }) => {
      const path = join(dir, basename(file));
      writeFileSync(path, wrapJava(source));
      return path;
    });
    const fileOf = new Map(paths.map((path, index) => [path, blocks[index]?.file ?? path]));
    const diagnostics: ContentDiagnostic[] = [];

    const parse = run(commands.java(), [join(HELPERS, 'JavaParse.java'), ...paths]);
    const unparsable = new Set<string>();
    for (const line of parse.stdout.split('\n').filter((entry) => entry !== '')) {
      const [path = '', row = '1', column = '1', ...message] = line.split('\t');
      // Later javac errors in the same file are usually cascades of the first one.
      if (unparsable.has(path)) continue;
      unparsable.add(path);
      // The wrapper adds one line above and two columns of indentation.
      diagnostics.push(
        diagnostic(
          fileOf.get(path) ?? path,
          'toolchain',
          'javac',
          message.join('\t'),
          Number(row) - 1,
          Number(column) - 2,
        ),
      );
    }
    if (parse.status !== 0 && unparsable.size === 0) {
      throw new Error(`javac parse helper failed: ${parse.stderr.trim()}`);
    }

    const formattable = paths.filter((path) => !unparsable.has(path));
    if (formattable.length > 0) {
      const format = run(commands.googleJavaFormat(), ['--replace', ...formattable]);
      if (format.status !== 0)
        throw new Error(`google-java-format failed: ${format.stderr.trim()}`);
      formattable.forEach((path) => {
        const file = fileOf.get(path) ?? path;
        const source = blocks.find((block) => block.file === file)?.source;
        if (unwrapJava(readFileSync(path, 'utf8')) !== source) {
          diagnostics.push(
            diagnostic(file, 'format', 'not-formatted', 'differs from google-java-format output'),
          );
        }
      });
    }
    return diagnostics;
  });
}

function pythonDiagnostics(blocks: readonly ToolchainBlock[]): ContentDiagnostic[] {
  return withTempDir((dir) => {
    const paths = blocks.map(({ file, source }) => {
      const path = join(dir, basename(file));
      writeFileSync(path, source);
      return path;
    });
    const fileOf = new Map(paths.map((path, index) => [path, blocks[index]?.file ?? path]));
    const diagnostics: ContentDiagnostic[] = [];

    const compile = run(commands.python(), [join(HELPERS, 'python_check.py'), ...paths]);
    if (compile.status === 2) throw new Error(compile.stderr.trim());
    const failed = new Set<string>();
    for (const line of compile.stdout.split('\n').filter((entry) => entry !== '')) {
      const {
        path,
        line: row,
        column,
        message,
      } = JSON.parse(line) as {
        path: string;
        line: number;
        column: number;
        message: string;
      };
      failed.add(path);
      diagnostics.push(
        diagnostic(fileOf.get(path) ?? path, 'toolchain', 'python', message, row, column),
      );
    }

    const formattable = paths.filter((path) => !failed.has(path));
    if (formattable.length > 0) {
      // Exit 1 lists files black would reformat; 123 means black itself failed.
      const check = run(commands.black(), ['--check', '--target-version', 'py312', ...formattable]);
      if (check.status === 123) throw new Error(`black failed: ${check.stderr.trim()}`);
      for (const [, path] of check.stderr.matchAll(/^would reformat (.+)$/gm)) {
        const file = fileOf.get(path ?? '') ?? path ?? '';
        diagnostics.push(
          diagnostic(file, 'format', 'not-formatted', 'differs from black (py312) output'),
        );
      }
    }
    return diagnostics;
  });
}

const STDLIB_FILE = 'tools/content-cli/src/python-stdlib.json';

/** Compares the pinned standard library list with the real Python 3.12 one. */
export function pythonStdlibDiagnostics(): ContentDiagnostic[] {
  const result = run(commands.python(), [join(HELPERS, 'python_check.py'), '--stdlib']);
  if (result.status !== 0) throw new Error(result.stderr.trim());
  const actual = new Set(JSON.parse(result.stdout) as string[]);
  const missing = [...actual].filter((name) => !PYTHON_STDLIB.has(name));
  const extra = [...PYTHON_STDLIB].filter((name) => !actual.has(name));
  if (missing.length === 0 && extra.length === 0) return [];
  return [
    diagnostic(
      STDLIB_FILE,
      'toolchain',
      'stdlib-drift',
      `differs from Python's sys.stdlib_module_names: missing ${JSON.stringify(missing)}, extra ${JSON.stringify(extra)}`,
    ),
  ];
}

/** Versions recorded in content/dist/toolchains.json by a full build. */
export function toolchainVersions(): Record<string, string> {
  const firstLine = (result: RunResult) =>
    `${result.stdout}\n${result.stderr}`
      .split('\n')
      .find((line) => line.trim() !== '')
      ?.trim() ?? '';
  return {
    black: firstLine(run(commands.black(), ['--version'])),
    googleJavaFormat: firstLine(run(commands.googleJavaFormat(), ['--version'])),
    java: firstLine(run(commands.java(), ['-version'])),
    python: firstLine(run(commands.python(), ['--version'])),
    // gofmt has no version flag; it ships with the Go toolchain on PATH.
    go: firstLine(run({ program: process.env.GO ?? 'go', args: [] }, ['version'])),
  };
}
