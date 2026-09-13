import { readFileSync } from 'node:fs';

import type { Node } from 'web-tree-sitter';

import type { ContentDiagnostic } from './diagnostics';
import type { LanguageConfig } from './languages';
import type { WrappedTree } from './tree-sitter';

export const MIN_LINES = 5;
export const MAX_LINES = 30;

/**
 * Module names of the Python 3.12 standard library (`sys.stdlib_module_names`), pinned so this
 * stage runs without Python. The content toolchain CI job compares it with the real list.
 */
export const PYTHON_STDLIB: ReadonlySet<string> = new Set(
  (
    JSON.parse(readFileSync(new URL('./python-stdlib.json', import.meta.url), 'utf8')) as {
      modules: string[];
    }
  ).modules,
);

/** Stage 5 (§5.1, §5.4.1): line count, block shape, and standard-library-only imports. */
export function constraintDiagnostics(
  config: LanguageConfig,
  source: string,
  wrapped: WrappedTree,
  file: string,
): ContentDiagnostic[] {
  const diagnostics: ContentDiagnostic[] = [];
  const report = (node: Node | null, code: string, message: string): void => {
    const row = node === null ? wrapped.lineOffset : node.startPosition.row;
    diagnostics.push({
      file,
      line: Math.max(1, row - wrapped.lineOffset + 1),
      column: node === null ? 1 : node.startPosition.column + 1,
      stage: 'constraints',
      code,
      message,
    });
  };

  const lines = source.endsWith('\n') ? source.split('\n').length - 1 : source.split('\n').length;
  if (lines < MIN_LINES || lines > MAX_LINES) {
    report(
      null,
      'line-count',
      `a block has ${String(MIN_LINES)}-${String(MAX_LINES)} lines, this one has ${String(lines)}`,
    );
  }

  const root = wrapped.tree.rootNode;
  switch (config.language) {
    case 'typescript':
      for (const node of root.descendantsOfType('import_statement')) {
        report(node, 'import', 'imports are not allowed: use built-in globals only');
      }
      for (const node of root.descendantsOfType('call_expression')) {
        if (node.childForFieldName('function')?.text === 'require') {
          report(node, 'import', '`require` is not allowed: use built-in globals only');
        }
      }
      break;
    case 'go': {
      const declarations = root.namedChildren.filter((node) => node.type !== 'package_clause');
      if (declarations.length !== 1) {
        report(
          declarations[1] ?? null,
          'block-shape',
          `a Go block holds exactly one top-level declaration, found ${String(declarations.length)}`,
        );
      }
      break;
    }
    case 'java': {
      const body = root.namedChildren[0]?.childForFieldName('body');
      const members = body?.namedChildren ?? [];
      if (members.length !== 1) {
        report(
          members[1] ?? null,
          'block-shape',
          `a Java block holds exactly one member, found ${String(members.length)}`,
        );
      }
      break;
    }
    case 'python':
      checkPythonShape(root, report);
      checkPythonImports(root, report);
      break;
  }
  return diagnostics;
}

type Report = (node: Node | null, code: string, message: string) => void;

const DEFINITIONS = new Set(['function_definition', 'class_definition', 'decorated_definition']);

function definitionOf(node: Node): Node | null {
  return node.type === 'decorated_definition' ? node.childForFieldName('definition') : node;
}

function checkPythonShape(root: Node, report: Report): void {
  const statements = root.namedChildren;
  const [only] = statements;
  if (statements.length !== 1 || only === undefined || !DEFINITIONS.has(only.type)) {
    report(
      statements[1] ?? only ?? null,
      'block-shape',
      'a Python block holds exactly one top-level definition',
    );
    return;
  }
  const definition = definitionOf(only);
  if (definition?.type !== 'class_definition') return;
  const members = definition.childForFieldName('body')?.namedChildren ?? [];
  const methods = members.filter((node) => definitionOf(node)?.type === 'function_definition');
  if (members.length !== 1 || methods.length !== 1) {
    report(
      members[1] ?? definition,
      'block-shape',
      'a Python class block holds exactly one method',
    );
  }
}

function checkPythonImports(root: Node, report: Report): void {
  const check = (node: Node, dotted: Node | null | undefined): void => {
    if (dotted === null || dotted === undefined || dotted.type === 'relative_import') {
      report(node, 'import', 'relative imports are not allowed');
      return;
    }
    const name = dotted.text.split('.')[0] ?? '';
    if (!PYTHON_STDLIB.has(name)) {
      report(node, 'import', `"${name}" is not in the Python 3.12 standard library`);
    }
  };
  for (const node of root.descendantsOfType('import_statement')) {
    for (const child of node.namedChildren) {
      check(node, child.type === 'aliased_import' ? child.childForFieldName('name') : child);
    }
  }
  for (const node of root.descendantsOfType('import_from_statement')) {
    check(node, node.childForFieldName('module_name'));
  }
}
