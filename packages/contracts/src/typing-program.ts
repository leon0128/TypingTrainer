import { z } from 'zod';

/** Printable ASCII only (§5.1). Newlines are never part of literal, auto, or padding text. */
const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;
/** Blank text: one or more spaces. */
const SPACES = /^ +$/;

/** Characters the player must type. */
export const LiteralAtomSchema = z.object({
  kind: z.literal('literal'),
  text: z.string().regex(PRINTABLE_ASCII),
});

/**
 * Characters the engine inserts on the player's behalf: closing brackets and quotes, and line
 * indentation. Never typed. `filledBy` is the index of the atom whose completion makes this
 * text appear as already-typed on screen.
 */
export const AutoAtomSchema = z.object({
  kind: z.literal('auto'),
  text: z.string().regex(PRINTABLE_ASCII),
  filledBy: z.int().nonnegative(),
});

/**
 * Alignment spaces a formatter inserts before an in-line separator (e.g. gofmt aligning struct
 * fields). Never typed, never counted, always displayed as plain whitespace.
 */
export const PaddingAtomSchema = z.object({
  kind: z.literal('padding'),
  text: z.string().regex(SPACES),
});

/**
 * Inter-token whitespace.
 * canonical === '\n' -> only Enter is accepted, and it is always required.
 * canonical === ' '  -> only Space is accepted; `required` per §3.3.1.
 */
export const SeparatorAtomSchema = z.object({
  kind: z.literal('separator'),
  canonical: z.enum(['\n', ' ']),
  required: z.boolean(),
});

/** Smallest unit of a typing program (§3.2). */
export const AtomSchema = z.discriminatedUnion('kind', [
  LiteralAtomSchema,
  AutoAtomSchema,
  PaddingAtomSchema,
  SeparatorAtomSchema,
]);

export type LiteralAtom = z.infer<typeof LiteralAtomSchema>;
export type AutoAtom = z.infer<typeof AutoAtomSchema>;
export type PaddingAtom = z.infer<typeof PaddingAtomSchema>;
export type SeparatorAtom = z.infer<typeof SeparatorAtomSchema>;
export type Atom = z.infer<typeof AtomSchema>;

/** Maximum effective keystrokes: literal characters + separator count (§3.2). */
export function countCanonicalKeystrokes(atoms: readonly Atom[]): number {
  let total = 0;
  for (const atom of atoms) {
    if (atom.kind === 'literal') total += atom.text.length;
    else if (atom.kind === 'separator') total += 1;
  }
  return total;
}

/**
 * The internal form of a block (§3.2), with the structural invariants the engine relies on:
 *
 * 1. `canonicalKeystrokes` matches the atoms.
 * 2. Every `auto` atom is filled by an earlier atom. Blank `auto` text (indentation) is filled
 *    by the line-break separator immediately before it; any other `auto` text (a closing
 *    bracket or quote) is filled by an earlier literal. Which literal opens the pair is
 *    language-specific, so the block compiler guarantees it, not this schema.
 * 3. The first typed atom (ignoring auto and padding atoms) is a literal.
 * 4. A required in-line space separator is always followed by a literal somewhere later.
 * 5. A line-break separator is always required.
 * 6. A literal that follows a separator (ignoring auto and padding atoms) does not start with a
 *    space. Otherwise Space would be consumed or ignored by the separator and could never reach
 *    it.
 * 7. A `padding` atom directly follows a literal or a non-blank `auto` atom and directly
 *    precedes an in-line space separator.
 */
export const TypingProgramSchema = z
  .object({
    blockId: z.string().min(1),
    atoms: z.array(AtomSchema).min(1),
    canonicalKeystrokes: z.int().nonnegative(),
  })
  .superRefine((program, ctx) => {
    const { atoms } = program;
    const isUntyped = (atom: Atom | undefined) => atom?.kind === 'auto' || atom?.kind === 'padding';

    const expectedKeystrokes = countCanonicalKeystrokes(atoms);
    if (program.canonicalKeystrokes !== expectedKeystrokes) {
      ctx.addIssue({
        code: 'custom',
        path: ['canonicalKeystrokes'],
        message: `canonicalKeystrokes is ${String(program.canonicalKeystrokes)} but the atoms add up to ${String(expectedKeystrokes)}`,
      });
    }

    const firstTyped = atoms.find((atom) => !isUntyped(atom));
    if (firstTyped?.kind !== 'literal') {
      ctx.addIssue({
        code: 'custom',
        path: ['atoms'],
        message: 'the first typed atom must be a literal',
      });
    }

    let previousTyped: Atom | undefined;
    atoms.forEach((atom, index) => {
      const previous = atoms[index - 1];
      const next = atoms[index + 1];

      if (atom.kind === 'auto') {
        if (SPACES.test(atom.text)) {
          const filledByLineBreak =
            atom.filledBy === index - 1 &&
            previous?.kind === 'separator' &&
            previous.canonical === '\n';
          if (!filledByLineBreak) {
            ctx.addIssue({
              code: 'custom',
              path: ['atoms', index, 'filledBy'],
              message:
                'indentation must be filled by the line-break separator immediately before it',
            });
          }
        } else {
          const filler = atom.filledBy < index ? atoms[atom.filledBy] : undefined;
          if (filler?.kind !== 'literal') {
            ctx.addIssue({
              code: 'custom',
              path: ['atoms', index, 'filledBy'],
              message: 'a closing auto atom must be filled by an earlier literal',
            });
          }
        }
        return;
      }

      if (atom.kind === 'padding') {
        const followsToken =
          previous?.kind === 'literal' ||
          (previous?.kind === 'auto' && !SPACES.test(previous.text));
        const precedesSpace = next?.kind === 'separator' && next.canonical === ' ';
        if (!followsToken || !precedesSpace) {
          ctx.addIssue({
            code: 'custom',
            path: ['atoms', index],
            message:
              'padding must directly follow a literal or a non-blank auto atom and directly precede a space separator',
          });
        }
        return;
      }

      if (
        atom.kind === 'literal' &&
        previousTyped?.kind === 'separator' &&
        atom.text.startsWith(' ')
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['atoms', index, 'text'],
          message: 'a literal following a separator must not start with a space',
        });
      }
      previousTyped = atom;
    });

    let literalSeenFromEnd = false;
    for (let index = atoms.length - 1; index >= 0; index -= 1) {
      const atom = atoms[index];
      if (atom?.kind === 'literal') {
        literalSeenFromEnd = true;
      } else if (atom?.kind === 'separator') {
        if (atom.canonical === '\n' && !atom.required) {
          ctx.addIssue({
            code: 'custom',
            path: ['atoms', index, 'required'],
            message: 'a line-break separator must be required',
          });
        }
        if (atom.canonical === ' ' && atom.required && !literalSeenFromEnd) {
          ctx.addIssue({
            code: 'custom',
            path: ['atoms', index],
            message: 'a required space separator must be followed by a literal',
          });
        }
      }
    }
  });

export type TypingProgram = z.infer<typeof TypingProgramSchema>;
