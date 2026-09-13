import {
  SourceSyntaxError,
  classifySeparator,
  type LanguageAdapter,
  type PairRule,
  type SeparatorAnalysis,
  type SyntaxIssue,
  type Token,
  type TokenPiece,
} from '../language-adapter';
import { GoTokenKind, scanGo, type GoToken } from './go-scanner';

const PAIR_RULES: readonly PairRule[] = [
  { pair: 'paren', open: '(', close: ')' },
  { pair: 'bracket', open: '[', close: ']' },
  { pair: 'brace', open: '{', close: '}' },
  { pair: 'double-quote', open: '"', close: '"' },
  { pair: 'single-quote', open: "'", close: "'" },
  { pair: 'backtick', open: '`', close: '`' },
];

/**
 * Go adapter (§5.4.1). Lexes with a scanner written from the Go specification and pinned to the
 * official go/scanner by golden data, because no JavaScript port of go/scanner exists and
 * tree-sitter cannot re-lex token pairs (§9.1).
 *
 * Blocks are gofmt output normalized with `normalizeIndentation(source, { tabWidth: 4 })`;
 * gofmt's alignment spaces become padding. There is no parser: beyond lexical errors, only an
 * opening brace on its own line is reported as a syntax error. Grammar is validated by
 * tools/content-cli (§5.2).
 */
export const goAdapter: LanguageAdapter = {
  slug: 'go',
  tokenize,
  separatorRule: (prev, next) => ({ required: analyzeGoSeparator(prev, next).required }),
  pairRules: () => [...PAIR_RULES],
  indentRule: () => ({ width: 4, alignment: 'spaces' }),
};

/** §3.3.1 for Go: a separator is optional only if re-lexing `A.text + B.text` yields [A, B]. */
export function analyzeGoSeparator(
  prev: Pick<Token, 'text'>,
  next: Pick<Token, 'text'>,
): SeparatorAnalysis {
  const { tokens, errors } = scanGo(prev.text + next.text);
  return classifySeparator(
    prev.text,
    next.text,
    tokens.map((token) => token.text),
    errors.map((error) => error.code),
  );
}

function tokenize(source: string): Token[] {
  const { tokens, errors } = scanGo(source);
  const issues: SyntaxIssue[] = errors.map(({ start, end, message }) => ({ start, end, message }));

  tokens.forEach((token, index) => {
    const previous = tokens[index - 1];
    if (token.text !== '{' || previous === undefined || !insertsSemicolon(previous)) return;
    if (!source.slice(previous.end, token.start).includes('\n')) return;
    issues.push({
      start: token.start,
      end: token.end,
      message:
        'unexpected newline before "{": Go inserts a semicolon at the line break, so an opening brace must stay on the same line',
    });
  });
  if (issues.length > 0) throw new SourceSyntaxError(issues);

  return tokens.map((token) => ({
    kind: token.kind,
    text: token.text,
    start: token.start,
    end: token.end,
    pieces: splitPieces(token),
  }));
}

/** Tokens after which a line break inserts a semicolon (Go specification, Semicolons). */
function insertsSemicolon({ kind, text }: GoToken): boolean {
  switch (kind) {
    case GoTokenKind.Identifier:
    case GoTokenKind.Int:
    case GoTokenKind.Float:
    case GoTokenKind.Imaginary:
    case GoTokenKind.Rune:
    case GoTokenKind.String:
    case GoTokenKind.RawString:
      return true;
    case GoTokenKind.Keyword:
      return ['break', 'continue', 'fallthrough', 'return'].includes(text);
    case GoTokenKind.Operator:
      return ['++', '--', ')', ']', '}'].includes(text);
    default:
      return false;
  }
}

function splitPieces({ kind, text }: GoToken): TokenPiece[] {
  const plain = (value: string): TokenPiece[] =>
    value === '' ? [] : [{ role: 'plain', text: value }];
  const quoted = (pair: string, quote: string): TokenPiece[] => [
    { role: 'open', pair, text: quote },
    ...plain(text.slice(1, -1)),
    { role: 'close', pair, text: quote },
  ];

  switch (kind) {
    case GoTokenKind.String:
      return quoted('double-quote', '"');
    case GoTokenKind.Rune:
      return quoted('single-quote', "'");
    case GoTokenKind.RawString:
      return quoted('backtick', '`');
    case GoTokenKind.Operator: {
      const rule = PAIR_RULES.find(
        (candidate) => candidate.open === text || candidate.close === text,
      );
      if (rule === undefined || rule.pair.endsWith('quote')) return plain(text);
      return [{ role: rule.open === text ? 'open' : 'close', pair: rule.pair, text }];
    }
    default:
      return plain(text);
  }
}
