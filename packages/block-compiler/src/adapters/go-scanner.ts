/**
 * A scanner for Go source written from the lexical elements of the Go specification
 * (https://go.dev/ref/spec#Lexical_elements), following the structure of the standard library's
 * go/scanner. Whitespace and comments are skipped, and automatically inserted semicolons are not
 * produced. Conformance with go/scanner is pinned by golden data (scripts/go-reference).
 */

export const GoTokenKind = {
  Identifier: 1,
  Keyword: 2,
  Operator: 3,
  Int: 4,
  Float: 5,
  Imaginary: 6,
  Rune: 7,
  String: 8,
  RawString: 9,
  Illegal: 10,
} as const;
export type GoTokenKind = (typeof GoTokenKind)[keyof typeof GoTokenKind];

export interface GoToken {
  readonly kind: GoTokenKind;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface GoScanError {
  /** Stable identifier, e.g. `string-not-terminated`. */
  readonly code: string;
  readonly message: string;
  readonly start: number;
  readonly end: number;
}

export interface GoScanResult {
  readonly tokens: GoToken[];
  readonly errors: GoScanError[];
}

const KEYWORDS = new Set([
  'break',
  'case',
  'chan',
  'const',
  'continue',
  'default',
  'defer',
  'else',
  'fallthrough',
  'for',
  'func',
  'go',
  'goto',
  'if',
  'import',
  'interface',
  'map',
  'package',
  'range',
  'return',
  'select',
  'struct',
  'switch',
  'type',
  'var',
]);

/** Operators and punctuation, longest first, so the first match is the longest one. */
const OPERATORS = [
  '&^=',
  '<<=',
  '>>=',
  '...',
  '&&',
  '||',
  '<-',
  '++',
  '--',
  '==',
  '!=',
  '<=',
  '>=',
  ':=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '<<',
  '>>',
  '&^',
  '+',
  '-',
  '*',
  '/',
  '%',
  '&',
  '|',
  '^',
  '<',
  '>',
  '=',
  '!',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  ',',
  ';',
  '.',
  ':',
  '~',
];

const SIMPLE_ESCAPES = new Set(['a', 'b', 'f', 'n', 'r', 't', 'v', '\\']);

const lower = (ch: string): string => ch.toLowerCase();
const isDecimal = (ch: string): boolean => ch >= '0' && ch <= '9';
const isHex = (ch: string): boolean => isDecimal(ch) || (lower(ch) >= 'a' && lower(ch) <= 'f');
const isLetter = (ch: string): boolean =>
  ch === '_' ||
  (ch >= 'a' && ch <= 'z') ||
  (ch >= 'A' && ch <= 'Z') ||
  (ch.charCodeAt(0) >= 0x80 && /\p{L}/u.test(ch));
const isIdentifierPart = (ch: string): boolean =>
  isLetter(ch) || isDecimal(ch) || (ch.charCodeAt(0) >= 0x80 && /\p{Nd}/u.test(ch));

function literalName(prefix: string): string {
  switch (prefix) {
    case 'x':
      return 'hexadecimal literal';
    case 'o':
    case '0':
      return 'octal literal';
    case 'b':
      return 'binary literal';
    default:
      return 'decimal literal';
  }
}

/** Index of the first misplaced `_` in a number literal, or -1 (go/scanner invalidSep). */
function invalidSeparator(text: string): number {
  let x1 = ' ';
  let d = '.';
  let i = 0;
  if (text.length >= 2 && text.startsWith('0')) {
    x1 = lower(text.charAt(1));
    if (x1 === 'x' || x1 === 'o' || x1 === 'b') {
      d = '0';
      i = 2;
    }
  }
  for (; i < text.length; i += 1) {
    const p = d;
    d = text.charAt(i);
    if (d === '_') {
      if (p !== '0') return i;
    } else if (isDecimal(d) || (x1 === 'x' && isHex(d))) {
      d = '0';
    } else {
      if (p === '_') return i - 1;
      d = '.';
    }
  }
  return d === '_' ? text.length - 1 : -1;
}

export function scanGo(source: string): GoScanResult {
  const tokens: GoToken[] = [];
  const errors: GoScanError[] = [];
  let offset = 0;

  const peek = (ahead = 0): string => source.charAt(offset + ahead);
  const fail = (code: string, message: string, start: number, end = start + 1): void => {
    errors.push({ code, message, start, end: Math.min(Math.max(end, start), source.length) });
  };
  const emit = (kind: GoTokenKind, start: number): void => {
    tokens.push({ kind, text: source.slice(start, offset), start, end: offset });
  };

  /** Consumes digits of `base` and `_`; bit 0 of the result: digit seen, bit 1: `_` seen. */
  const digits = (base: number, invalid: { index: number } | null): number => {
    let digsep = 0;
    if (base <= 10) {
      const max = String.fromCharCode(48 + base);
      for (let ch = peek(); isDecimal(ch) || ch === '_'; ch = peek()) {
        if (ch === '_') {
          digsep |= 2;
        } else {
          digsep |= 1;
          if (ch >= max && invalid && invalid.index < 0) invalid.index = offset;
        }
        offset += 1;
      }
    } else {
      for (let ch = peek(); isHex(ch) || ch === '_'; ch = peek()) {
        digsep |= ch === '_' ? 2 : 1;
        offset += 1;
      }
    }
    return digsep;
  };

  const scanNumber = (start: number): void => {
    let kind: GoTokenKind = GoTokenKind.Int;
    let base = 10;
    let prefix = '';
    let digsep = 0;
    const invalid = { index: -1 };

    if (peek() !== '.') {
      if (peek() === '0') {
        offset += 1;
        const marker = lower(peek());
        if (marker === 'x' || marker === 'o' || marker === 'b') {
          offset += 1;
          prefix = marker;
          base = marker === 'x' ? 16 : marker === 'o' ? 8 : 2;
        } else {
          prefix = '0';
          base = 8;
          digsep = 1;
        }
      }
      digsep |= digits(base, invalid);
    }

    if (peek() === '.') {
      kind = GoTokenKind.Float;
      if (prefix === 'o' || prefix === 'b') {
        fail('invalid-radix-point', `invalid radix point in ${literalName(prefix)}`, offset);
      }
      offset += 1;
      digsep |= digits(base, invalid);
    }

    if ((digsep & 1) === 0) {
      fail('no-digits', `${literalName(prefix)} has no digits`, offset);
    }

    const exponent = lower(peek());
    if (exponent === 'e' || exponent === 'p') {
      if (exponent === 'e' && prefix !== '' && prefix !== '0') {
        fail('exponent-mantissa', `'${peek()}' exponent requires decimal mantissa`, offset);
      } else if (exponent === 'p' && prefix !== 'x') {
        fail('exponent-mantissa', `'${peek()}' exponent requires hexadecimal mantissa`, offset);
      }
      offset += 1;
      kind = GoTokenKind.Float;
      if (peek() === '+' || peek() === '-') offset += 1;
      const exponentDigits = digits(10, null);
      digsep |= exponentDigits;
      if ((exponentDigits & 1) === 0) fail('exponent-no-digits', 'exponent has no digits', offset);
    } else if (prefix === 'x' && kind === GoTokenKind.Float) {
      fail('hex-mantissa', "hexadecimal mantissa requires a 'p' exponent", offset);
    }

    if (peek() === 'i') {
      kind = GoTokenKind.Imaginary;
      offset += 1;
    }

    const text = source.slice(start, offset);
    if (kind === GoTokenKind.Int && invalid.index >= 0) {
      const digit = source.charAt(invalid.index);
      fail('invalid-digit', `invalid digit '${digit}' in ${literalName(prefix)}`, invalid.index);
    }
    if ((digsep & 2) !== 0) {
      const index = invalidSeparator(text);
      if (index >= 0) {
        fail('invalid-separator', "'_' must separate successive digits", start + index);
      }
    }
    emit(kind, start);
  };

  /** Called just after a backslash; returns whether the escape is valid (go/scanner scanEscape). */
  const scanEscape = (quote: string): boolean => {
    const start = offset;
    const ch = peek();
    let count: number;
    let base: number;
    let max: number;
    if (SIMPLE_ESCAPES.has(ch) || ch === quote) {
      offset += 1;
      return true;
    } else if (ch >= '0' && ch <= '7') {
      [count, base, max] = [3, 8, 255];
    } else if (ch === 'x') {
      offset += 1;
      [count, base, max] = [2, 16, 255];
    } else if (ch === 'u') {
      offset += 1;
      [count, base, max] = [4, 16, 0x10ffff];
    } else if (ch === 'U') {
      offset += 1;
      [count, base, max] = [8, 16, 0x10ffff];
    } else {
      const terminated = ch !== '';
      fail(
        terminated ? 'unknown-escape' : 'escape-not-terminated',
        terminated ? 'unknown escape sequence' : 'escape sequence not terminated',
        start,
      );
      return false;
    }

    let value = 0;
    for (; count > 0; count -= 1) {
      const digit = peek();
      const digitValue = isHex(digit) ? parseInt(digit, 16) : Number.POSITIVE_INFINITY;
      if (digitValue >= base) {
        const terminated = digit !== '';
        fail(
          terminated ? 'illegal-escape-character' : 'escape-not-terminated',
          terminated
            ? `illegal character ${JSON.stringify(digit)} in escape sequence`
            : 'escape sequence not terminated',
          offset,
        );
        return false;
      }
      value = value * base + digitValue;
      offset += 1;
    }
    if (value > max || (value >= 0xd800 && value < 0xe000)) {
      fail('invalid-code-point', 'escape sequence is invalid Unicode code point', start);
      return false;
    }
    return true;
  };

  const scanString = (start: number): void => {
    for (;;) {
      const ch = peek();
      if (ch === '\n' || ch === '') {
        fail('string-not-terminated', 'string literal not terminated', start, offset);
        break;
      }
      offset += 1;
      if (ch === '"') break;
      if (ch === '\\') scanEscape('"');
    }
    emit(GoTokenKind.String, start);
  };

  const scanRune = (start: number): void => {
    let valid = true;
    let characters = 0;
    for (;;) {
      const ch = peek();
      if (ch === '\n' || ch === '') {
        if (valid) fail('rune-not-terminated', 'rune literal not terminated', start, offset);
        valid = false;
        break;
      }
      offset += 1;
      if (ch === "'") break;
      characters += 1;
      if (ch === '\\' && !scanEscape("'")) valid = false;
    }
    if (valid && characters !== 1) fail('illegal-rune', 'illegal rune literal', start, offset);
    emit(GoTokenKind.Rune, start);
  };

  const scanRawString = (start: number): void => {
    const close = source.indexOf('`', offset);
    if (close === -1) {
      fail('raw-string-not-terminated', 'raw string literal not terminated', start, source.length);
      offset = source.length;
    } else {
      offset = close + 1;
    }
    emit(GoTokenKind.RawString, start);
  };

  while (offset < source.length) {
    const ch = peek();
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      offset += 1;
      continue;
    }
    if (ch === '/' && peek(1) === '/') {
      while (offset < source.length && peek() !== '\n') offset += 1;
      continue;
    }
    if (ch === '/' && peek(1) === '*') {
      const close = source.indexOf('*/', offset + 2);
      if (close === -1) {
        fail('comment-not-terminated', 'comment not terminated', offset, source.length);
        offset = source.length;
      } else {
        offset = close + 2;
      }
      continue;
    }

    const start = offset;
    if (isLetter(ch)) {
      while (offset < source.length && isIdentifierPart(peek())) offset += 1;
      const word = source.slice(start, offset);
      emit(KEYWORDS.has(word) ? GoTokenKind.Keyword : GoTokenKind.Identifier, start);
    } else if (isDecimal(ch) || (ch === '.' && isDecimal(peek(1)))) {
      scanNumber(start);
    } else if (ch === '"') {
      offset += 1;
      scanString(start);
    } else if (ch === "'") {
      offset += 1;
      scanRune(start);
    } else if (ch === '`') {
      offset += 1;
      scanRawString(start);
    } else {
      const operator = OPERATORS.find((candidate) => source.startsWith(candidate, offset));
      if (operator !== undefined) {
        offset += operator.length;
        emit(GoTokenKind.Operator, start);
      } else {
        const width = (source.codePointAt(offset) ?? 0) > 0xffff ? 2 : 1;
        offset += width;
        fail(
          'illegal-character',
          `illegal character ${JSON.stringify(source.slice(start, offset))}`,
          start,
          offset,
        );
        emit(GoTokenKind.Illegal, start);
      }
    }
  }

  return { tokens, errors };
}
