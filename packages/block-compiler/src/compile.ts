import {
  TypingProgramSchema,
  countCanonicalKeystrokes,
  type Atom,
  type TypingProgram,
} from '@typing-trainer/contracts';

import {
  CompileError,
  type CompileDiagnostic,
  type CompileErrorCode,
  type SourcePosition,
} from './compile-error';
import { SourceSyntaxError, type LanguageAdapter, type Token } from './language-adapter';

type Report = (code: CompileErrorCode, message: string, start: number, end?: number) => void;
type Locate = (offset: number) => SourcePosition;

/**
 * Compiles one block into a typing program (§3.3).
 *
 * Stage 1 stops at syntax errors. Stage 2 collects every character, whitespace, pairing, and
 * typing-program diagnostic in one pass. Stage 3 validates the result against
 * TypingProgramSchema as a fail-safe. Throws `CompileError` with all diagnostics of the first
 * failing stage.
 */
export function compileBlock(
  source: string,
  adapter: LanguageAdapter,
  blockId: string,
): TypingProgram {
  const locate = createLocator(source);
  const diagnostics: CompileDiagnostic[] = [];
  const report: Report = (code, message, start, end = start) => {
    diagnostics.push({ code, message, start: locate(start), end: locate(end) });
  };
  const fail = () => new CompileError(blockId, sortByOffset(diagnostics));

  let tokens: Token[];
  try {
    tokens = adapter.tokenize(source);
  } catch (error) {
    if (!(error instanceof SourceSyntaxError)) throw error;
    for (const issue of error.issues) report('syntax', issue.message, issue.start, issue.end);
    throw fail();
  }

  checkCharacters(source, report);
  const atoms = buildAtoms(source, tokens, adapter, report, locate);
  if (diagnostics.length > 0) throw fail();

  const parsed = TypingProgramSchema.safeParse({
    blockId,
    atoms,
    canonicalKeystrokes: countCanonicalKeystrokes(atoms),
  });
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join('; ');
    report(
      'invalid-program',
      `the compiled program violates TypingProgramSchema: ${details}`,
      0,
      source.length,
    );
    throw fail();
  }
  return parsed.data;
}

function checkCharacters(source: string, report: Report): void {
  for (let offset = 0; offset < source.length;) {
    const codePoint = source.codePointAt(offset) ?? 0;
    const width = codePoint > 0xffff ? 2 : 1;
    if (codePoint === 0x09) {
      report('tab', 'tab characters are not allowed; indent with spaces', offset, offset + 1);
    } else if (codePoint === 0x0d) {
      report(
        'carriage-return',
        'carriage returns are not allowed; use LF line endings',
        offset,
        offset + 1,
      );
    } else if (codePoint !== 0x0a && (codePoint < 0x20 || codePoint > 0x7e)) {
      const hex = codePoint.toString(16).toUpperCase().padStart(4, '0');
      report('non-ascii', `character U+${hex} is not printable ASCII`, offset, offset + width);
    }
    offset += width;
  }
}

function buildAtoms(
  source: string,
  tokens: readonly Token[],
  adapter: LanguageAdapter,
  report: Report,
  locate: Locate,
): Atom[] {
  const atoms: Atom[] = [];
  const atomOffsets: number[] = [];
  const push = (atom: Atom, offset: number): number => {
    atoms.push(atom);
    atomOffsets.push(offset);
    return atoms.length - 1;
  };

  const pairs = new Map(adapter.pairRules().map((rule) => [rule.pair, rule]));
  const { width: indentWidth, alignment } = adapter.indentRule();
  const openPairs: { pair: string; atomIndex: number; offset: number }[] = [];

  let cursor = 0;
  let previous: Token | undefined;
  for (const token of tokens) {
    if (token.start < cursor || token.end <= token.start || token.end > source.length) {
      throw new Error(
        `Adapter "${adapter.slug}" returned an empty, overlapping, or out-of-range token at offset ${String(token.start)}`,
      );
    }

    const gap = source.slice(cursor, token.start);
    if (previous === undefined) {
      checkLeadingGap(gap, report);
    } else {
      addWhitespace(gap, cursor, previous, token);
    }

    let offset = token.start;
    for (const piece of token.pieces) {
      if (piece.text === '') throw new Error(`Adapter "${adapter.slug}" returned an empty piece`);
      if (piece.role === 'plain') {
        push({ kind: 'literal', text: piece.text }, offset);
      } else {
        const rule = pairs.get(piece.pair);
        if (rule === undefined) {
          throw new Error(`Adapter "${adapter.slug}" used unknown pair "${piece.pair}"`);
        }
        if (piece.role === 'open') {
          const atomIndex = push({ kind: 'literal', text: piece.text }, offset);
          openPairs.push({ pair: piece.pair, atomIndex, offset });
        } else {
          closePair(piece.text, piece.pair, offset, rule.open);
        }
      }
      offset += piece.text.length;
    }
    if (offset !== token.end) {
      throw new Error(`Adapter "${adapter.slug}" returned pieces that do not add up to the token`);
    }

    cursor = token.end;
    previous = token;
  }

  checkTrailingGap(source.slice(cursor), cursor, report);
  for (const open of openPairs) {
    const close = pairs.get(open.pair)?.close ?? open.pair;
    report('unclosed-open', `this opening is never closed with "${close}"`, open.offset);
  }
  checkLiteralsAfterSeparators(atoms, atomOffsets, report);
  return atoms;

  function closePair(text: string, pair: string, offset: number, expectedOpen: string): void {
    const end = offset + text.length;
    const top = openPairs.pop();
    if (top === undefined) {
      report('unmatched-close', `"${text}" has no matching "${expectedOpen}"`, offset, end);
      return;
    }
    if (top.pair !== pair) {
      const opened = locate(top.offset);
      const topOpen = pairs.get(top.pair)?.open ?? top.pair;
      report(
        'mismatched-close',
        `"${text}" does not close "${topOpen}" opened at ${String(opened.line)}:${String(opened.column)}`,
        offset,
        end,
      );
      return;
    }
    push({ kind: 'auto', text, filledBy: top.atomIndex }, offset);
  }

  function addWhitespace(gap: string, gapStart: number, prev: Token, next: Token): void {
    if (gap === '') return;
    const comment = gap.indexOf('/');
    if (comment !== -1) {
      report('comment', 'comments are not allowed in blocks', gapStart + comment, next.start);
      return;
    }

    const firstBreak = gap.indexOf('\n');
    if (firstBreak === -1) {
      // Gaps with tabs or other characters have already been reported by checkCharacters.
      const extraSpaces = /^ +$/.test(gap) ? gap.length - 1 : 0;
      if (extraSpaces > 0 && alignment === 'spaces') {
        // Formatter alignment (§3.3.3): everything but the last space is padding.
        push({ kind: 'padding', text: ' '.repeat(extraSpaces) }, gapStart);
      } else if (extraSpaces > 0) {
        report(
          'multiple-spaces',
          `${String(gap.length)} consecutive spaces between tokens; use exactly one`,
          gapStart,
          next.start,
        );
      }
      const { required } = adapter.separatorRule(prev, next);
      push({ kind: 'separator', canonical: ' ', required }, gapStart + extraSpaces);
      return;
    }

    const trailingSpace = gap.slice(0, firstBreak).indexOf(' ');
    if (trailingSpace !== -1) {
      report(
        'trailing-whitespace',
        'trailing whitespace is not allowed',
        gapStart + trailingSpace,
        gapStart + firstBreak,
      );
    }
    const lastBreak = gap.lastIndexOf('\n');
    if (lastBreak !== firstBreak) {
      report(
        'blank-line',
        'blank lines are not allowed inside a block',
        gapStart + firstBreak + 1,
        gapStart + lastBreak,
      );
    }

    const lineBreak = push(
      { kind: 'separator', canonical: '\n', required: true },
      gapStart + firstBreak,
    );
    const indentation = gap.slice(lastBreak + 1);
    // Indentation containing other characters (tabs) has already been reported.
    if (indentation === '' || !/^ +$/.test(indentation)) return;
    const indentStart = gapStart + lastBreak + 1;
    if (indentation.length % indentWidth !== 0) {
      report(
        'indentation-width',
        `indentation of ${String(indentation.length)} spaces is not a multiple of ${String(indentWidth)}`,
        indentStart,
        next.start,
      );
    }
    push({ kind: 'auto', text: indentation, filledBy: lineBreak }, indentStart);
  }
}

function checkLeadingGap(gap: string, report: Report): void {
  if (gap === '') return;
  const comment = gap.indexOf('/');
  if (comment !== -1) {
    report('comment', 'comments are not allowed in blocks', comment, gap.length);
  } else if (gap.includes('\n')) {
    report('blank-line', 'a block must not start with a blank line', 0, gap.length);
  } else {
    report('leading-indentation', 'the first line of a block must not be indented', 0, gap.length);
  }
}

/** A block may end with at most one line break. */
function checkTrailingGap(gap: string, gapStart: number, report: Report): void {
  const comment = gap.indexOf('/');
  if (comment !== -1) {
    report(
      'comment',
      'comments are not allowed in blocks',
      gapStart + comment,
      gapStart + gap.length,
    );
    return;
  }
  const space = gap.indexOf(' ');
  if (space !== -1) {
    report(
      'trailing-whitespace',
      'trailing whitespace is not allowed',
      gapStart + space,
      gapStart + gap.length,
    );
  }
  const firstBreak = gap.indexOf('\n');
  if (firstBreak !== -1 && gap.includes('\n', firstBreak + 1)) {
    report(
      'blank-line',
      'a block must not end with a blank line',
      gapStart + firstBreak + 1,
      gapStart + gap.length,
    );
  }
}

/** Invariant 6 of TypingProgramSchema, reported with a source position (§3.3). */
function checkLiteralsAfterSeparators(
  atoms: readonly Atom[],
  atomOffsets: readonly number[],
  report: Report,
): void {
  let previousTyped: Atom | undefined;
  atoms.forEach((atom, index) => {
    if (atom.kind === 'auto' || atom.kind === 'padding') return;
    if (
      atom.kind === 'literal' &&
      previousTyped?.kind === 'separator' &&
      atom.text.startsWith(' ')
    ) {
      const offset = atomOffsets[index] ?? 0;
      report(
        'space-literal-after-separator',
        'text starting with a space cannot follow whitespace across a closing delimiter (e.g. `${ value } text`); remove the space before the delimiter',
        offset,
        offset + atom.text.length,
      );
    }
    previousTyped = atom;
  });
}

function createLocator(source: string): Locate {
  const lineStarts = [0];
  for (let offset = 0; offset < source.length; offset += 1) {
    if (source[offset] === '\n') lineStarts.push(offset + 1);
  }
  return (offset) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((lineStarts[mid] ?? 0) <= offset) low = mid;
      else high = mid - 1;
    }
    return { offset, line: low + 1, column: offset - (lineStarts[low] ?? 0) + 1 };
  };
}

function sortByOffset(diagnostics: readonly CompileDiagnostic[]): CompileDiagnostic[] {
  return [...diagnostics].sort((a, b) => a.start.offset - b.start.offset);
}
