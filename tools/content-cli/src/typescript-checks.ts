import { format } from 'prettier';
import ts from 'typescript';

import type { ContentDiagnostic } from './diagnostics';

/**
 * Stage 2 for TypeScript: the block must be byte-equal to Prettier's output with its default
 * options (double quotes, 80 columns). `format` reads no configuration file, so the repository's
 * own `.prettierrc` for code does not apply to content.
 */
export async function prettierDiagnostics(
  source: string,
  file: string,
): Promise<ContentDiagnostic[]> {
  let formatted: string;
  try {
    formatted = await format(source, { parser: 'typescript' });
  } catch (error) {
    return [
      {
        file,
        line: 1,
        column: 1,
        stage: 'format',
        code: 'formatter-failed',
        message: `Prettier could not format the block: ${error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error)}`,
      },
    ];
  }
  if (formatted === source) return [];

  const actual = source.split('\n');
  const expected = formatted.split('\n');
  const index = actual.findIndex((line, i) => line !== expected[i]);
  const line = index === -1 ? Math.min(actual.length, expected.length) : index;
  return [
    {
      file,
      line: line + 1,
      column: 1,
      stage: 'format',
      code: 'not-formatted',
      message: `differs from Prettier's default output here; expected ${JSON.stringify(expected[line] ?? '')}`,
    },
  ];
}

/** Stage 3 for TypeScript: syntax diagnostics from the `typescript` package, which runs in Node. */
export function typescriptSyntaxDiagnostics(source: string, file: string): ContentDiagnostic[] {
  const { diagnostics = [] } = ts.transpileModule(source, {
    reportDiagnostics: true,
    fileName: 'block.ts',
  });
  return diagnostics.map((diagnostic) => {
    const position =
      diagnostic.file !== undefined && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : { line: 0, character: 0 };
    return {
      file,
      line: position.line + 1,
      column: position.character + 1,
      stage: 'toolchain',
      code: `TS${String(diagnostic.code)}`,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
    };
  });
}
