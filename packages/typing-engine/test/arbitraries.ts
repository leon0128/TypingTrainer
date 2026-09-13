import { countCanonicalKeystrokes, type Atom, type TypingProgram } from '@typing-trainer/contracts';
import fc from 'fast-check';

import { createEngineState, handleKey, type EngineState } from '../src';

/**
 * Characters for generated literals. Closing brackets are excluded because, as in compiled
 * blocks, they only ever appear as auto atoms. Spaces are excluded because a literal never
 * starts with one after a separator, and in-string spaces add nothing to these properties.
 */
const LITERAL_CHARS = Array.from('abcxyz019_$.,;:=+-*/<>!&|?"\'`@#%^~\\');
const BRACKETS = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
] as const;

/** Keys used to probe states: literal characters, closers, and every whitespace key. */
export const PROBE_KEYS = ['a', 'x', '1', ';', '=', '(', ')', ']', '}', ' ', 'Enter', 'Tab'];

type Step =
  | { readonly type: 'literal'; readonly text: string }
  | { readonly type: 'open'; readonly prefix: string; readonly bracket: 0 | 1 | 2 }
  | { readonly type: 'close' }
  | { readonly type: 'space'; readonly required: boolean; readonly padding: number }
  | { readonly type: 'newline'; readonly indent: number }
  /** Close brackets, optionally after a space, then break the line or add a space. */
  | {
      readonly type: 'closeRun';
      readonly spaceBefore: boolean;
      readonly closes: number;
      readonly then: 'newline' | 'space';
      readonly indent: number;
    };

const literalText = (minLength: number) =>
  fc.string({ unit: fc.constantFrom(...LITERAL_CHARS), minLength, maxLength: 4 });

const indentArbitrary = fc.integer({ min: 0, max: 3 });

const stepArbitrary: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({ type: fc.constant('literal' as const), text: literalText(1) }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      type: fc.constant('open' as const),
      prefix: literalText(0),
      bracket: fc.constantFrom(0 as const, 1 as const, 2 as const),
    }),
  },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('close' as const) }) },
  {
    weight: 3,
    arbitrary: fc.record({
      type: fc.constant('space' as const),
      required: fc.boolean(),
      // Alignment padding before the separator, as gofmt emits it.
      padding: fc.constantFrom(0, 0, 1, 3),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ type: fc.constant('newline' as const), indent: indentArbitrary }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      type: fc.constant('closeRun' as const),
      spaceBefore: fc.boolean(),
      closes: fc.integer({ min: 1, max: 3 }),
      then: fc.constantFrom('newline' as const, 'space' as const),
      indent: indentArbitrary,
    }),
  },
);

function lastTypedAtom(atoms: readonly Atom[]): Atom | undefined {
  for (let index = atoms.length - 1; index >= 0; index -= 1) {
    const atom = atoms[index];
    if (atom?.kind !== 'auto' && atom?.kind !== 'padding') return atom;
  }
  return undefined;
}

/** True when nothing but indentation has been emitted since the last line break. */
function atLineStart(atoms: readonly Atom[]): boolean {
  for (let index = atoms.length - 1; index >= 0; index -= 1) {
    const atom = atoms[index];
    if (atom?.kind === 'auto' && atom.text.startsWith(' ')) continue;
    return atom?.kind === 'separator' && atom.canonical === '\n';
  }
  return false;
}

/**
 * Builds a program shaped like compiler output: brackets close with auto atoms, line breaks
 * are followed by auto indentation, whitespace never leads a line, trails a line, or doubles
 * up directly (alignment padding may precede an in-line space), and a required space never
 * follows another separator (closing tokens never fuse with the next token).
 */
export function buildProgram(first: string, steps: readonly Step[]): TypingProgram {
  const atoms: Atom[] = [{ kind: 'literal', text: first }];
  const openBrackets: { index: number; closer: string }[] = [];

  const whitespaceAllowed = () => atoms.at(-1)?.kind !== 'separator' && !atLineStart(atoms);
  const followsToken = () => {
    const last = atoms.at(-1);
    return last?.kind === 'literal' || (last?.kind === 'auto' && !last.text.startsWith(' '));
  };
  const pushSpace = (required: boolean) => {
    const afterSeparator = lastTypedAtom(atoms)?.kind === 'separator';
    atoms.push({ kind: 'separator', canonical: ' ', required: required && !afterSeparator });
  };
  const pushLineBreak = (indent: number) => {
    const lineBreak = atoms.length;
    atoms.push({ kind: 'separator', canonical: '\n', required: true });
    if (indent > 0) {
      atoms.push({ kind: 'auto', text: '  '.repeat(indent), filledBy: lineBreak });
    }
  };
  const closeBracket = () => {
    const open = openBrackets.pop();
    if (open) atoms.push({ kind: 'auto', text: open.closer, filledBy: open.index });
  };

  for (const step of steps) {
    switch (step.type) {
      case 'literal':
        atoms.push({ kind: 'literal', text: step.text });
        break;
      case 'open': {
        const [opener, closer] = BRACKETS[step.bracket];
        openBrackets.push({ index: atoms.length, closer });
        atoms.push({ kind: 'literal', text: step.prefix + opener });
        break;
      }
      case 'close':
        closeBracket();
        break;
      case 'space':
        if (!whitespaceAllowed()) break;
        if (step.padding > 0 && followsToken()) {
          atoms.push({ kind: 'padding', text: ' '.repeat(step.padding) });
        }
        pushSpace(step.required);
        break;
      case 'newline':
        if (whitespaceAllowed()) pushLineBreak(step.indent);
        break;
      case 'closeRun':
        if (openBrackets.length === 0) break;
        if (step.spaceBefore && whitespaceAllowed()) pushSpace(false);
        for (let i = 0; i < step.closes; i += 1) closeBracket();
        if (step.then === 'newline') pushLineBreak(step.indent);
        else pushSpace(false);
        break;
    }
  }

  for (let open = openBrackets.pop(); open; open = openBrackets.pop()) {
    atoms.push({ kind: 'auto', text: open.closer, filledBy: open.index });
  }

  // A required space must be followed by a literal (TypingProgramSchema invariant).
  let literalAfter = false;
  for (let index = atoms.length - 1; index >= 0; index -= 1) {
    const atom = atoms[index];
    if (atom?.kind === 'literal') literalAfter = true;
    else if (
      atom?.kind === 'separator' &&
      atom.required &&
      !literalAfter &&
      atom.canonical === ' '
    ) {
      atoms[index] = { ...atom, required: false };
    }
  }

  return { blockId: 'generated', atoms, canonicalKeystrokes: countCanonicalKeystrokes(atoms) };
}

export const programArbitrary: fc.Arbitrary<TypingProgram> = fc
  .tuple(literalText(1), fc.array(stepArbitrary, { minLength: 8, maxLength: 80, size: 'medium' }))
  .map(([first, steps]) => buildProgram(first, steps));

/**
 * How many spaces to press at each in-line separator, cycled over the program's separators.
 * Required separators get at least one.
 */
export const spacingArbitrary = fc.array(fc.integer({ min: 0, max: 3 }), {
  minLength: 1,
  maxLength: 32,
});

/** A correct key sequence for the program using the given spacing style. */
export function correctKeys(program: TypingProgram, spacing: readonly number[]): string[] {
  const keys: string[] = [];
  let separatorCount = 0;
  for (const atom of program.atoms) {
    if (atom.kind === 'literal') {
      keys.push(...Array.from(atom.text));
    } else if (atom.kind === 'separator') {
      if (atom.canonical === '\n') {
        keys.push('Enter');
      } else {
        const chosen = spacing[separatorCount % spacing.length] ?? 0;
        const count = atom.required ? Math.max(1, chosen) : chosen;
        for (let i = 0; i < count; i += 1) keys.push(' ');
      }
      separatorCount += 1;
    }
  }
  return keys;
}

/** Every state visited while typing `keys`, starting with the initial state. */
export function visitedStates(program: TypingProgram, keys: readonly string[]): EngineState[] {
  let state = createEngineState(program);
  const states = [state];
  for (const key of keys) {
    state = handleKey(state, key).state;
    states.push(state);
  }
  return states;
}
