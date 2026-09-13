/**
 * A scanner for Python 3.12 source written from the lexical analysis chapter of the Python
 * reference and the behavior of CPython's C tokenizer, including PEP 701 f-strings. Whitespace,
 * comments, and line continuations are skipped; NEWLINE, NL, INDENT, and DEDENT are not produced
 * (the block compiler derives line breaks and indentation from the text between tokens).
 * Indentation and bracket stacks are kept only to report errors. Conformance with CPython is pinned
 * by golden data (scripts/python-reference).
 */

export const PythonTokenKind = {
  Name: 1,
  Keyword: 2,
  Operator: 3,
  Number: 4,
  String: 5,
  FStringStart: 6,
  FStringMiddle: 7,
  FStringEnd: 8,
  Illegal: 9,
} as const;
export type PythonTokenKind = (typeof PythonTokenKind)[keyof typeof PythonTokenKind];

/**
 * - 'bracket': bracket balance (unmatched, mismatched, or unclosed brackets)
 * - 'lexical': every other error the tokenizer reports, including indentation errors
 */
export type PythonScanErrorCategory = 'bracket' | 'lexical';

export interface PythonToken {
  readonly kind: PythonTokenKind;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface PythonScanError {
  /** Stable identifier, e.g. `unterminated-string`. */
  readonly code: string;
  readonly category: PythonScanErrorCategory;
  readonly message: string;
  readonly start: number;
  readonly end: number;
}

export interface PythonScanResult {
  readonly tokens: PythonToken[];
  readonly errors: PythonScanError[];
}

export interface PythonScanOptions {
  /**
   * Scan a fragment such as two joined tokens: indentation and block structure are not checked.
   * Used by separator rules (§3.3.1).
   */
  readonly fragment?: boolean;
}

interface BracketFrame {
  readonly kind: 'bracket';
  readonly char: '(' | '[' | '{';
  readonly start: number;
  /** Whether this `{` opens an f-string replacement field. */
  readonly field: boolean;
}

interface FStringFrame {
  readonly kind: 'fstring';
  readonly quote: string;
  readonly raw: boolean;
  readonly start: number;
}

/** The format spec after `:` in a replacement field. */
interface SpecFrame {
  readonly kind: 'spec';
  readonly start: number;
}

type Frame = BracketFrame | FStringFrame | SpecFrame;

const KEYWORDS = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
]);

/** Keywords CPython tolerates directly after a number with only a SyntaxWarning (`1if`). */
const NUMBER_KEYWORDS = ['and', 'else', 'for', 'if', 'in', 'is', 'not', 'or'];

const STRING_PREFIXES = new Set(['r', 'u', 'b', 'br', 'rb', 'f', 'fr', 'rf']);
/** PEP 750 template strings (Python 3.14): rejected, blocks target Python 3.12. */
const TSTRING_PREFIXES = new Set(['t', 'tr', 'rt']);

/** Operators and delimiters other than brackets, longest first. */
const OPERATORS = [
  '**=',
  '//=',
  '>>=',
  '<<=',
  '...',
  '!=',
  '%=',
  '&=',
  '**',
  '*=',
  '+=',
  '-=',
  '->',
  '//',
  '/=',
  ':=',
  '<<',
  '<=',
  '==',
  '>=',
  '>>',
  '@=',
  '^=',
  '|=',
  '~',
  '+',
  '-',
  '*',
  '/',
  '%',
  '@',
  '&',
  '|',
  '^',
  '<',
  '>',
  ',',
  ':',
  ';',
  '.',
  '=',
  '!',
];

const CLOSER_OF = { '(': ')', '[': ']', '{': '}' } as const;

const isDecimal = (ch: string): boolean => ch >= '0' && ch <= '9';
const isHex = (ch: string): boolean =>
  isDecimal(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
const isOctal = (ch: string): boolean => ch >= '0' && ch <= '7';
const isBinary = (ch: string): boolean => ch === '0' || ch === '1';
const isIdentifierStart = (ch: string): boolean =>
  ch === '_' ||
  (ch >= 'a' && ch <= 'z') ||
  (ch >= 'A' && ch <= 'Z') ||
  (ch.charCodeAt(0) >= 0x80 && /[\p{L}\p{Nl}]/u.test(ch));
const isIdentifierPart = (ch: string): boolean =>
  isIdentifierStart(ch) ||
  isDecimal(ch) ||
  (ch.charCodeAt(0) >= 0x80 && /[\p{Mn}\p{Mc}\p{Nd}\p{Pc}]/u.test(ch));

export function scanPython(source: string, options: PythonScanOptions = {}): PythonScanResult {
  const fragment = options.fragment ?? false;
  const tokens: PythonToken[] = [];
  const errors: PythonScanError[] = [];
  const frames: Frame[] = [];
  const indents: number[] = [];
  let offset = 0;
  let atLineStart = true;
  /** Last token of the current logical line. */
  let lineLast: PythonToken | undefined;
  /** Last token of the previous non-blank logical line. */
  let previousLineLast: PythonToken | undefined;

  const peek = (ahead = 0): string => source.charAt(offset + ahead);
  const fail = (
    code: string,
    category: PythonScanErrorCategory,
    message: string,
    start: number,
    end = start + 1,
  ): void => {
    errors.push({
      code,
      category,
      message,
      start,
      end: Math.min(Math.max(end, start), source.length),
    });
  };
  const emit = (kind: PythonTokenKind, start: number): void => {
    if (offset <= start) return;
    const token = { kind, text: source.slice(start, offset), start, end: offset };
    tokens.push(token);
    lineLast = token;
  };
  const innermostFString = (): number => {
    for (let index = frames.length - 1; index >= 0; index -= 1) {
      if (frames[index]?.kind === 'fstring') return index;
    }
    return -1;
  };
  /** Reports the f-string at `index` as unterminated and drops it with everything inside it. */
  const unterminatedFString = (index: number): void => {
    const frame = frames[index];
    if (frame?.kind !== 'fstring') return;
    fail(
      'unterminated-fstring',
      'lexical',
      frame.quote.length === 3
        ? 'unterminated triple-quoted f-string literal'
        : 'unterminated f-string literal',
      frame.start,
      offset,
    );
    frames.length = index;
  };
  const endLogicalLine = (): void => {
    if (lineLast !== undefined) {
      previousLineLast = lineLast;
      lineLast = undefined;
    }
    atLineStart = true;
  };
  const opensBlock = (token: PythonToken | undefined): boolean =>
    token?.kind === PythonTokenKind.Operator && token.text === ':';

  const checkIndentation = (column: number, at: number): void => {
    if (fragment) return;
    const top = indents.at(-1);
    if (top === undefined) {
      // The first logical line sets the base; an indented first line is reported by the core.
      indents.push(column);
      return;
    }
    const expectsIndent = opensBlock(previousLineLast);
    if (column > top) {
      if (!expectsIndent) fail('unexpected-indent', 'lexical', 'unexpected indent', at);
      indents.push(column);
      return;
    }
    if (expectsIndent) fail('expected-indent', 'lexical', 'expected an indented block', at);
    while (indents.length > 1 && (indents.at(-1) ?? 0) > column) indents.pop();
    if (indents.at(-1) !== column) {
      fail(
        'unindent-mismatch',
        'lexical',
        'unindent does not match any outer indentation level',
        at,
      );
    }
  };

  /** Scans f-string text (or a format spec) until a quote, a replacement field, or its end. */
  const scanLiteral = (frame: FStringFrame | SpecFrame): void => {
    const fstringIndex = innermostFString();
    const fstring = frames[fstringIndex];
    if (fstring?.kind !== 'fstring')
      throw new Error('Python scanner: format spec outside f-string');
    const chunkStart = offset;
    const flush = (): void => {
      emit(PythonTokenKind.FStringMiddle, chunkStart);
    };

    for (;;) {
      if (offset >= source.length) {
        flush();
        return;
      }
      if (frame.kind === 'fstring' && source.startsWith(frame.quote, offset)) {
        flush();
        const start = offset;
        offset += frame.quote.length;
        emit(PythonTokenKind.FStringEnd, start);
        frames.pop();
        return;
      }
      const ch = peek();
      if (ch === '\n' && fstring.quote.length === 1) {
        flush();
        unterminatedFString(fstringIndex);
        return;
      }
      if (ch === '{') {
        if (frame.kind === 'fstring' && peek(1) === '{') {
          fail(
            'fstring-brace-escape',
            'lexical',
            "f-string brace escapes ('{{' and '}}') are not allowed in blocks",
            offset,
            offset + 2,
          );
          offset += 2;
          continue;
        }
        flush();
        const start = offset;
        offset += 1;
        emit(PythonTokenKind.Operator, start);
        frames.push({ kind: 'bracket', char: '{', start, field: true });
        return;
      }
      if (ch === '}') {
        if (frame.kind === 'spec') {
          flush();
          frames.pop();
          return;
        }
        if (peek(1) === '}') {
          fail(
            'fstring-brace-escape',
            'lexical',
            "f-string brace escapes ('{{' and '}}') are not allowed in blocks",
            offset,
            offset + 2,
          );
          offset += 2;
          continue;
        }
        fail('fstring-single-brace', 'lexical', "f-string: single '}' is not allowed", offset);
        offset += 1;
        continue;
      }
      if (ch === '\\') {
        if (!fstring.raw && peek(1) === 'N' && peek(2) === '{') {
          const close = source.indexOf('}', offset);
          offset = close === -1 ? source.length : close + 1;
          continue;
        }
        offset += peek(1) === '' ? 1 : 2;
        continue;
      }
      offset += 1;
    }
  };

  const scanString = (start: number, prefix: string): void => {
    const q = peek();
    const quote = source.startsWith(q.repeat(3), offset) ? q.repeat(3) : q;
    offset += quote.length;
    const lower = prefix.toLowerCase();
    if (lower.includes('t')) {
      fail(
        'tstring',
        'lexical',
        't-strings are not supported: blocks target Python 3.12',
        start,
        offset,
      );
    }
    if (lower.includes('f') || lower.includes('t')) {
      emit(PythonTokenKind.FStringStart, start);
      frames.push({ kind: 'fstring', quote, raw: lower.includes('r'), start });
      return;
    }
    for (;;) {
      if (offset >= source.length) {
        fail(
          'unterminated-string',
          'lexical',
          quote.length === 3
            ? 'unterminated triple-quoted string literal'
            : 'unterminated string literal',
          start,
          offset,
        );
        break;
      }
      if (source.startsWith(quote, offset)) {
        offset += quote.length;
        break;
      }
      const ch = peek();
      if (ch === '\n' && quote.length === 1) {
        fail('unterminated-string', 'lexical', 'unterminated string literal', start, offset);
        break;
      }
      offset += ch === '\\' && peek(1) !== '' ? 2 : 1;
    }
    emit(PythonTokenKind.String, start);
  };

  /** Consumes digits and single `_` separators; returns false if an `_` is not followed by a digit. */
  const digitsWithUnderscores = (isDigit: (ch: string) => boolean): boolean => {
    let valid = true;
    while (isDigit(peek()) || peek() === '_') {
      if (peek() === '_' && !isDigit(peek(1))) valid = false;
      offset += 1;
    }
    return valid;
  };

  const scanNumber = (start: number): void => {
    let valid = true;
    let name = 'decimal';
    let exponentFailed = false;
    const marker = peek(1).toLowerCase();

    if (peek() === '0' && (marker === 'x' || marker === 'o' || marker === 'b')) {
      offset += 2;
      name = marker === 'x' ? 'hexadecimal' : marker === 'o' ? 'octal' : 'binary';
      const isDigit = marker === 'x' ? isHex : marker === 'o' ? isOctal : isBinary;
      const digitsStart = offset;
      valid =
        digitsWithUnderscores(isDigit) && /[0-9a-fA-F]/.test(source.slice(digitsStart, offset));
    } else {
      if (peek() !== '.' && !digitsWithUnderscores(isDecimal)) valid = false;
      if (peek() === '.') {
        offset += 1;
        if (isDecimal(peek()) && !digitsWithUnderscores(isDecimal)) valid = false;
      }
      if (peek() === 'e' || peek() === 'E') {
        const signed = peek(1) === '+' || peek(1) === '-';
        if (isDecimal(peek(signed ? 2 : 1))) {
          offset += signed ? 2 : 1;
          if (!digitsWithUnderscores(isDecimal)) valid = false;
        } else {
          exponentFailed = true;
        }
      }
    }
    if (valid && (peek() === 'j' || peek() === 'J')) {
      offset += 1;
      name = 'imaginary';
    }

    if (!valid) {
      fail('invalid-number', 'lexical', `invalid ${name} literal`, start, offset);
    } else if (
      !exponentFailed &&
      !source.slice(start, offset).endsWith('.') &&
      isIdentifierStart(peek())
    ) {
      let end = offset;
      while (isIdentifierPart(source.charAt(end))) end += 1;
      const word = source.slice(offset, end);
      if (NUMBER_KEYWORDS.some((keyword) => word.startsWith(keyword))) {
        // CPython 3.12: "SyntaxWarning: invalid decimal literal"; the keyword stays its own token.
        fail('number-keyword', 'lexical', `invalid ${name} literal`, start, end);
      } else {
        fail('invalid-number', 'lexical', `invalid ${name} literal`, start, end);
        offset = end;
      }
    }
    emit(PythonTokenKind.Number, start);
  };

  while (offset < source.length) {
    const top = frames.at(-1);
    if (top?.kind === 'fstring' || top?.kind === 'spec') {
      scanLiteral(top);
      continue;
    }

    if (atLineStart && frames.length === 0) {
      atLineStart = false;
      let column = 0;
      let index = offset;
      for (;;) {
        const ch = source.charAt(index);
        if (ch === ' ') column += 1;
        else if (ch === '\t') column = (Math.floor(column / 8) + 1) * 8;
        else if (ch === '\f') column = 0;
        else break;
        index += 1;
      }
      offset = index;
      const first = peek();
      if (first !== '\n' && first !== '\r' && first !== '#' && first !== '') {
        checkIndentation(column, offset);
      }
      continue;
    }

    const ch = peek();
    if (ch === ' ' || ch === '\t' || ch === '\f' || ch === '\r') {
      offset += 1;
      continue;
    }
    if (ch === '\n') {
      offset += 1;
      const fstringIndex = innermostFString();
      const fstring = frames[fstringIndex];
      if (fstring?.kind === 'fstring' && fstring.quote.length === 1) {
        unterminatedFString(fstringIndex);
      }
      if (frames.length === 0) endLogicalLine();
      continue;
    }
    if (ch === '#') {
      while (offset < source.length && peek() !== '\n') offset += 1;
      continue;
    }
    if (ch === '\\') {
      const skip = peek(1) === '\r' ? 2 : 1;
      if (source.charAt(offset + skip) === '\n') {
        offset += skip + 1;
        continue;
      }
      fail(
        'illegal-character',
        'lexical',
        'unexpected character after line continuation character',
        offset,
      );
      offset += 1;
      continue;
    }

    const start = offset;
    if (isIdentifierStart(ch)) {
      while (offset < source.length && isIdentifierPart(peek())) offset += 1;
      const word = source.slice(start, offset);
      const next = peek();
      const prefix = word.toLowerCase();
      if (
        (next === '"' || next === "'") &&
        (STRING_PREFIXES.has(prefix) || TSTRING_PREFIXES.has(prefix))
      ) {
        scanString(start, word);
        continue;
      }
      emit(KEYWORDS.has(word) ? PythonTokenKind.Keyword : PythonTokenKind.Name, start);
      continue;
    }
    if (isDecimal(ch) || (ch === '.' && isDecimal(peek(1)))) {
      scanNumber(start);
      continue;
    }
    if (ch === '"' || ch === "'") {
      scanString(start, '');
      continue;
    }
    if (ch === ':' && top?.kind === 'bracket' && top.field) {
      offset += 1;
      emit(PythonTokenKind.Operator, start);
      frames.push({ kind: 'spec', start });
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      offset += 1;
      emit(PythonTokenKind.Operator, start);
      frames.push({ kind: 'bracket', char: ch, start, field: false });
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      offset += 1;
      if (top?.kind === 'bracket') {
        if (CLOSER_OF[top.char] !== ch) {
          fail(
            'mismatched-bracket',
            'bracket',
            `closing parenthesis '${ch}' does not match opening parenthesis '${top.char}'`,
            start,
          );
        }
        frames.pop();
      } else {
        fail('unmatched-bracket', 'bracket', `unmatched '${ch}'`, start);
      }
      emit(PythonTokenKind.Operator, start);
      continue;
    }
    const operator = OPERATORS.find((candidate) => source.startsWith(candidate, offset));
    if (operator !== undefined) {
      offset += operator.length;
      emit(PythonTokenKind.Operator, start);
      continue;
    }
    offset += (source.codePointAt(offset) ?? 0) > 0xffff ? 2 : 1;
    fail(
      'illegal-character',
      'lexical',
      `invalid character ${JSON.stringify(source.slice(start, offset))}`,
      start,
      offset,
    );
    emit(PythonTokenKind.Illegal, start);
  }

  const outermostFString = frames.findIndex((frame) => frame.kind === 'fstring');
  if (outermostFString >= 0) {
    // Like CPython, an unterminated f-string is the only error reported at the end of input.
    unterminatedFString(outermostFString);
  } else {
    for (const frame of frames) {
      if (frame.kind === 'bracket') {
        fail('unclosed-bracket', 'bracket', `'${frame.char}' was never closed`, frame.start);
      }
    }
  }
  if (!fragment && frames.length === 0 && opensBlock(lineLast ?? previousLineLast)) {
    fail('expected-indent', 'lexical', 'expected an indented block', source.length);
  }

  return { tokens, errors };
}
