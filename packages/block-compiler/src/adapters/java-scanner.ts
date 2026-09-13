/**
 * A scanner for Java source written from the lexical structure of the Java Language
 * Specification (JLS §3), following javac's tokenizer where the specification leaves room.
 * Whitespace and comments are skipped. Unicode escapes (JLS §3.3) are NOT translated: the Java
 * adapter rejects them before this scanner runs. Conformance with javac is pinned by golden data
 * (scripts/java-reference).
 */

export const JavaTokenKind = {
  Identifier: 1,
  Keyword: 2,
  Operator: 3,
  Number: 4,
  Char: 5,
  String: 6,
  TextBlock: 7,
  Illegal: 8,
} as const;
export type JavaTokenKind = (typeof JavaTokenKind)[keyof typeof JavaTokenKind];

export interface JavaToken {
  readonly kind: JavaTokenKind;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface JavaScanError {
  /** Stable identifier, e.g. `unclosed-string`. */
  readonly code: string;
  readonly message: string;
  readonly start: number;
  readonly end: number;
}

export interface JavaScanResult {
  readonly tokens: JavaToken[];
  readonly errors: JavaScanError[];
}

/** Reserved keywords and the literals `true`, `false`, `null` (JLS §3.9, §3.10.3, §3.10.8). */
const KEYWORDS = new Set([
  '_',
  'abstract',
  'assert',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'default',
  'do',
  'double',
  'else',
  'enum',
  'extends',
  'false',
  'final',
  'finally',
  'float',
  'for',
  'goto',
  'if',
  'implements',
  'import',
  'instanceof',
  'int',
  'interface',
  'long',
  'native',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'short',
  'static',
  'strictfp',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'void',
  'volatile',
  'while',
]);

/** Separators and operators (JLS §3.11, §3.12), longest first so the first match is the longest. */
const OPERATORS = [
  '>>>=',
  '<<=',
  '>>=',
  '>>>',
  '...',
  '->',
  '::',
  '==',
  '>=',
  '<=',
  '!=',
  '&&',
  '||',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '&=',
  '|=',
  '^=',
  '%=',
  '<<',
  '>>',
  '(',
  ')',
  '{',
  '}',
  '[',
  ']',
  ';',
  ',',
  '.',
  '@',
  '=',
  '>',
  '<',
  '!',
  '~',
  '?',
  ':',
  '+',
  '-',
  '*',
  '/',
  '&',
  '|',
  '^',
  '%',
];

const SIMPLE_ESCAPES = new Set(['b', 's', 't', 'n', 'f', 'r', '"', "'", '\\']);

const lower = (ch: string): string => ch.toLowerCase();
const isDecimal = (ch: string): boolean => ch >= '0' && ch <= '9';
const isHex = (ch: string): boolean => isDecimal(ch) || (lower(ch) >= 'a' && lower(ch) <= 'f');
const isOctal = (ch: string): boolean => ch >= '0' && ch <= '7';
const isJavaLetter = (ch: string): boolean =>
  ch === '_' ||
  ch === '$' ||
  (ch >= 'a' && ch <= 'z') ||
  (ch >= 'A' && ch <= 'Z') ||
  (ch.charCodeAt(0) >= 0x80 && /[\p{L}\p{Sc}\p{Pc}]/u.test(ch));
const isJavaLetterOrDigit = (ch: string): boolean =>
  isJavaLetter(ch) ||
  isDecimal(ch) ||
  (ch.charCodeAt(0) >= 0x80 && /[\p{Nd}\p{Mn}\p{Mc}]/u.test(ch));

export function scanJava(source: string): JavaScanResult {
  const tokens: JavaToken[] = [];
  const errors: JavaScanError[] = [];
  let offset = 0;

  const peek = (ahead = 0): string => source.charAt(offset + ahead);
  const fail = (code: string, message: string, start: number, end = start + 1): void => {
    errors.push({ code, message, start, end: Math.min(Math.max(end, start), source.length) });
  };
  const emit = (kind: JavaTokenKind, start: number): void => {
    tokens.push({ kind, text: source.slice(start, offset), start, end: offset });
  };

  /** Consumes a run of digits accepted by `isDigit` and `_`; reports misplaced underscores. */
  const digitRun = (isDigit: (ch: string) => boolean): number => {
    const start = offset;
    let digits = 0;
    while (isDigit(peek()) || peek() === '_') {
      if (peek() !== '_') digits += 1;
      offset += 1;
    }
    const run = source.slice(start, offset);
    if (run.startsWith('_') || run.endsWith('_')) {
      fail('illegal-underscore', 'illegal underscore', run.startsWith('_') ? start : offset - 1);
    }
    return digits;
  };

  const exponent = (): void => {
    offset += 1;
    if (peek() === '+' || peek() === '-') offset += 1;
    if (digitRun(isDecimal) === 0) {
      fail('malformed-float', 'malformed floating-point literal', offset);
    }
  };

  const scanNumber = (start: number): void => {
    if (peek() === '0' && lower(peek(1)) === 'x') {
      offset += 2;
      let digits = digitRun(isHex);
      let fraction = false;
      if (peek() === '.') {
        fraction = true;
        offset += 1;
        digits += digitRun(isHex);
      }
      if (digits === 0) {
        fail(
          'hex-no-digits',
          'hexadecimal numbers must contain at least one hexadecimal digit',
          start,
          offset,
        );
      }
      if (lower(peek()) === 'p') {
        exponent();
        if ('fFdD'.includes(peek()) && peek() !== '') offset += 1;
      } else if (fraction) {
        fail('malformed-float', 'malformed floating-point literal', offset);
      } else if (lower(peek()) === 'l') {
        offset += 1;
      }
    } else if (peek() === '0' && lower(peek(1)) === 'b') {
      offset += 2;
      // Like javac, the tokenizer accepts any decimal digit here; 0b12 is rejected later.
      if (digitRun(isDecimal) === 0) {
        fail(
          'binary-no-digits',
          'binary numbers must contain at least one binary digit',
          start,
          offset,
        );
      }
      if (lower(peek()) === 'l') offset += 1;
    } else {
      let float = false;
      if (peek() !== '.') digitRun(isDecimal);
      if (peek() === '.') {
        float = true;
        offset += 1;
        digitRun(isDecimal);
      }
      if (lower(peek()) === 'e') {
        float = true;
        exponent();
      }
      if (peek() !== '' && 'fFdD'.includes(peek())) {
        offset += 1;
      } else if (!float && lower(peek()) === 'l') {
        offset += 1;
      }
    }
    emit(JavaTokenKind.Number, start);
  };

  /** Called just after a backslash inside a character or string literal. */
  const scanEscape = (): void => {
    const ch = peek();
    if (SIMPLE_ESCAPES.has(ch)) {
      offset += 1;
    } else if (isOctal(ch)) {
      const limit = ch <= '3' ? 3 : 2;
      for (let count = 0; count < limit && isOctal(peek()); count += 1) offset += 1;
    } else {
      fail('illegal-escape', 'illegal escape character', offset - 1, offset + 1);
      if (ch !== '' && ch !== '\n' && ch !== '\r') offset += 1;
    }
  };

  const scanString = (start: number): void => {
    offset += 1;
    for (;;) {
      const ch = peek();
      if (ch === '' || ch === '\n' || ch === '\r') {
        fail('unclosed-string', 'unclosed string literal', start, offset);
        break;
      }
      offset += 1;
      if (ch === '"') break;
      if (ch === '\\') scanEscape();
    }
    emit(JavaTokenKind.String, start);
  };

  const scanTextBlock = (start: number): void => {
    offset += 3;
    let lineStart = offset;
    while (
      peek(lineStart - offset) === ' ' ||
      peek(lineStart - offset) === '\t' ||
      peek(lineStart - offset) === '\f'
    ) {
      lineStart += 1;
    }
    const terminator = source.charAt(lineStart);
    if (terminator !== '\n' && terminator !== '\r') {
      // javac reports the delimiter and returns it as a token of its own.
      fail(
        'text-block-open',
        'illegal text block open delimiter sequence, missing line terminator',
        start,
        offset,
      );
      emit(JavaTokenKind.String, start);
      return;
    }
    offset = lineStart;
    for (;;) {
      if (offset >= source.length) {
        fail('unclosed-text-block', 'unclosed text block', start, offset);
        break;
      }
      if (source.startsWith('"""', offset)) {
        offset += 3;
        break;
      }
      offset += peek() === '\\' ? 2 : 1;
    }
    emit(JavaTokenKind.TextBlock, start);
  };

  const scanChar = (start: number): void => {
    offset += 1;
    const ch = peek();
    if (ch === "'") {
      offset += 1;
      fail('empty-char', 'empty character literal', start, offset);
      emit(JavaTokenKind.Char, start);
      return;
    }
    if (ch === '' || ch === '\n' || ch === '\r') {
      fail('unclosed-char', 'unclosed character literal', start, offset);
      emit(JavaTokenKind.Char, start);
      return;
    }
    offset += (source.codePointAt(offset) ?? 0) > 0xffff ? 2 : 1;
    if (ch === '\\') scanEscape();
    if (peek() === "'") {
      offset += 1;
    } else {
      fail('unclosed-char', 'unclosed character literal', start, offset);
    }
    emit(JavaTokenKind.Char, start);
  };

  while (offset < source.length) {
    const ch = peek();
    if (ch === ' ' || ch === '\t' || ch === '\f' || ch === '\n' || ch === '\r') {
      offset += 1;
      continue;
    }
    if (ch === '/' && peek(1) === '/') {
      while (offset < source.length && peek() !== '\n' && peek() !== '\r') offset += 1;
      continue;
    }
    if (ch === '/' && peek(1) === '*') {
      const close = source.indexOf('*/', offset + 2);
      if (close === -1) {
        fail('unclosed-comment', 'unclosed comment', offset, source.length);
        offset = source.length;
      } else {
        offset = close + 2;
      }
      continue;
    }

    const start = offset;
    if (isJavaLetter(ch)) {
      while (offset < source.length && isJavaLetterOrDigit(peek())) offset += 1;
      const word = source.slice(start, offset);
      emit(KEYWORDS.has(word) ? JavaTokenKind.Keyword : JavaTokenKind.Identifier, start);
    } else if (isDecimal(ch) || (ch === '.' && isDecimal(peek(1)))) {
      scanNumber(start);
    } else if (source.startsWith('"""', offset)) {
      scanTextBlock(start);
    } else if (ch === '"') {
      scanString(start);
    } else if (ch === "'") {
      scanChar(start);
    } else {
      const operator = OPERATORS.find((candidate) => source.startsWith(candidate, offset));
      if (operator !== undefined) {
        offset += operator.length;
        emit(JavaTokenKind.Operator, start);
      } else {
        offset += (source.codePointAt(offset) ?? 0) > 0xffff ? 2 : 1;
        fail(
          'illegal-character',
          `illegal character ${JSON.stringify(source.slice(start, offset))}`,
          start,
          offset,
        );
        emit(JavaTokenKind.Illegal, start);
      }
    }
  }

  return { tokens, errors };
}
