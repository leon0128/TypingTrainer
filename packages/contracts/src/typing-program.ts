import { z } from 'zod';

/** Printable ASCII only (§5.1). Newlines are never part of literal or auto text. */
const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;

/** Characters the player must type. */
export const LiteralAtomSchema = z.object({
  kind: z.literal('literal'),
  text: z.string().regex(PRINTABLE_ASCII),
});

/**
 * Characters the engine inserts on the player's behalf: closing brackets and line
 * indentation. Never typed. `filledBy` is the index of the atom whose completion makes
 * this text appear as already-typed on screen.
 */
export const AutoAtomSchema = z.object({
  kind: z.literal('auto'),
  text: z.string().regex(PRINTABLE_ASCII),
  filledBy: z.int().nonnegative(),
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
  SeparatorAtomSchema,
]);

export type LiteralAtom = z.infer<typeof LiteralAtomSchema>;
export type AutoAtom = z.infer<typeof AutoAtomSchema>;
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
 * 2. Every `auto` atom is filled by an earlier atom that is either a literal (an opening
 *    bracket or quote) or a line-break separator (indentation).
 * 3. The first typed (non-auto) atom is not a separator.
 * 4. A required in-line space separator is always followed by a literal somewhere later.
 * 5. A line-break separator is always required.
 */
export const TypingProgramSchema = z
  .object({
    blockId: z.string().min(1),
    atoms: z.array(AtomSchema).min(1),
    canonicalKeystrokes: z.int().nonnegative(),
  })
  .superRefine((program, ctx) => {
    const { atoms } = program;

    const expectedKeystrokes = countCanonicalKeystrokes(atoms);
    if (program.canonicalKeystrokes !== expectedKeystrokes) {
      ctx.addIssue({
        code: 'custom',
        path: ['canonicalKeystrokes'],
        message: `canonicalKeystrokes is ${String(program.canonicalKeystrokes)} but the atoms add up to ${String(expectedKeystrokes)}`,
      });
    }

    const firstTyped = atoms.find((atom) => atom.kind !== 'auto');
    if (firstTyped?.kind !== 'literal') {
      ctx.addIssue({
        code: 'custom',
        path: ['atoms'],
        message: 'the first typed atom must be a literal',
      });
    }

    let literalSeenFromEnd = false;
    for (let index = atoms.length - 1; index >= 0; index -= 1) {
      const atom = atoms[index];
      if (atom === undefined) continue;

      if (atom.kind === 'literal') {
        literalSeenFromEnd = true;
      } else if (atom.kind === 'separator') {
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
      } else {
        const filler = atom.filledBy < index ? atoms[atom.filledBy] : undefined;
        const validFiller =
          filler?.kind === 'literal' || (filler?.kind === 'separator' && filler.canonical === '\n');
        if (!validFiller) {
          ctx.addIssue({
            code: 'custom',
            path: ['atoms', index, 'filledBy'],
            message: 'filledBy must point to an earlier literal or line-break separator atom',
          });
        }
      }
    }
  });

export type TypingProgram = z.infer<typeof TypingProgramSchema>;
