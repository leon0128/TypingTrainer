import { createRequire } from 'node:module';

import { Language, Parser, type Node, type Tree } from 'web-tree-sitter';

import type { ContentDiagnostic } from './diagnostics';
import { wrapLineOffset, type LanguageConfig } from './languages';

const require = createRequire(import.meta.url);

let initialized: Promise<void> | undefined;
const parsers = new Map<string, Promise<Parser>>();

async function parserFor(config: LanguageConfig): Promise<Parser> {
  initialized ??= Parser.init();
  await initialized;
  let parser = parsers.get(config.language);
  if (parser === undefined) {
    parser = Language.load(require.resolve(config.grammar)).then((language) =>
      new Parser().setLanguage(language),
    );
    parsers.set(config.language, parser);
  }
  return parser;
}

export interface WrappedTree {
  readonly tree: Tree;
  /** Lines added above the block by the language's wrapper. */
  readonly lineOffset: number;
}

/** Parses a block inside its language wrapper (§5.2 stage 4). The caller must `tree.delete()`. */
export async function parseWrapped(config: LanguageConfig, source: string): Promise<WrappedTree> {
  const parser = await parserFor(config);
  const tree = parser.parse(config.wrap.before + source + config.wrap.after);
  if (tree === null) throw new Error(`tree-sitter could not parse a ${config.language} block`);
  return { tree, lineOffset: wrapLineOffset(config) };
}

/**
 * Reports ERROR and MISSING nodes (§5.2 stage 4).
 *
 * tree-sitter is a screen, not the authority: the language toolchain (stage 3) decides. Known gaps
 * of the pinned grammars, measured for v1.11 of docs/requirements.md:
 * - Missed, caught by the toolchain: TypeScript `08`; Go an opening brace on the next line; Java
 *   `'ab'`; Python `01`, `1_`, `1if y else 2`, t-strings, and a `def` without an indented body.
 * - Wrongly rejected: Java `1__0`, which is valid (JLS §3.10.1 allows runs of underscores between
 *   digits) and accepted by javac. tree-sitter-java 0.23.5 reports an ERROR node for it. Blocks hit
 *   by such a false positive are rewritten rather than exempted, so this check stays simple; the
 *   case is pinned by a test in test/pipeline.test.ts.
 */
export function treeSitterDiagnostics(
  { tree, lineOffset }: WrappedTree,
  file: string,
): ContentDiagnostic[] {
  const diagnostics: ContentDiagnostic[] = [];
  const visit = (node: Node): void => {
    if (node.isError || node.isMissing) {
      const { row, column } = node.startPosition;
      diagnostics.push({
        file,
        line: Math.max(1, row - lineOffset + 1),
        column: column + 1,
        stage: 'tree-sitter',
        code: node.isMissing ? 'missing-node' : 'error-node',
        message: node.isMissing
          ? `tree-sitter expected ${node.type} here`
          : `tree-sitter could not parse ${JSON.stringify(node.text.slice(0, 40))}`,
      });
      return;
    }
    if (node.hasError) for (const child of node.children) visit(child);
  };
  visit(tree.rootNode);
  return diagnostics;
}
