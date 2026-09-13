import {
  GoTokenKind,
  JavaTokenKind,
  PythonTokenKind,
  goAdapter,
  javaAdapter,
  normalizeIndentation,
  pythonAdapter,
  typescriptAdapter,
  type LanguageAdapter,
  type Token,
} from '@typing-trainer/block-compiler';
import type { ContentLanguage } from '@typing-trainer/contracts';
import ts from 'typescript';

// ts.SyntaxKind is an enum; Token.kind is a plain number shared by every adapter.
const TYPESCRIPT_IDENTIFIER: number = ts.SyntaxKind.Identifier;

export interface LanguageConfig {
  readonly language: ContentLanguage;
  /** File extension of block sources, without the dot. */
  readonly extension: string;
  readonly adapter: LanguageAdapter;
  /** The source handed to the block compiler; Go indentation is normalized to spaces (§5.4.1). */
  readonly prepare: (source: string) => string;
  /** Module specifier of the tree-sitter grammar's WebAssembly build. */
  readonly grammar: string;
  /** Text around a block so a fragment parses as a whole file; `before` must end with a newline. */
  readonly wrap: { readonly before: string; readonly after: string };
  /** Whether a compiled token is an identifier, which similarity checks replace by a placeholder. */
  readonly isIdentifier: (token: Token) => boolean;
}

export const LANGUAGES: Readonly<Record<ContentLanguage, LanguageConfig>> = {
  typescript: {
    language: 'typescript',
    extension: 'ts',
    adapter: typescriptAdapter,
    prepare: (source) => source,
    grammar: 'tree-sitter-typescript/tree-sitter-typescript.wasm',
    wrap: { before: '', after: '' },
    isIdentifier: (token) => token.kind === TYPESCRIPT_IDENTIFIER,
  },
  go: {
    language: 'go',
    extension: 'go',
    adapter: goAdapter,
    prepare: (source) => normalizeIndentation(source, { tabWidth: 4 }),
    grammar: 'tree-sitter-go/tree-sitter-go.wasm',
    wrap: { before: 'package p\n\n', after: '' },
    isIdentifier: (token) => token.kind === GoTokenKind.Identifier,
  },
  java: {
    language: 'java',
    extension: 'java',
    adapter: javaAdapter,
    prepare: (source) => source,
    grammar: 'tree-sitter-java/tree-sitter-java.wasm',
    wrap: { before: 'class Wrapper {\n', after: '}\n' },
    isIdentifier: (token) => token.kind === JavaTokenKind.Identifier,
  },
  python: {
    language: 'python',
    extension: 'py',
    adapter: pythonAdapter,
    prepare: (source) => source,
    grammar: 'tree-sitter-python/tree-sitter-python.wasm',
    wrap: { before: '', after: '' },
    isIdentifier: (token) => token.kind === PythonTokenKind.Name,
  },
};

/** Number of lines `wrap.before` adds above the block. */
export function wrapLineOffset(config: LanguageConfig): number {
  return config.wrap.before.split('\n').length - 1;
}
