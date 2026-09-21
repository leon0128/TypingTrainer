import {
  TypingProgramSchema,
  countCanonicalKeystrokes,
  type Atom,
  type TypingProgram,
} from '@typing-trainer/contracts';

/**
 * Compiles English lines into a typing program (§13.6): each word, with any punctuation attached
 * to it, is a literal; a space between words is a required space separator; and lines are joined by
 * a required Enter. There is no automatic insertion and no optional whitespace, so what the
 * player types is exactly the text. The lines are already checked to have single spaces.
 */
export function compileEnglish(blockId: string, lines: readonly string[]): TypingProgram {
  const atoms: Atom[] = [];
  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) atoms.push({ kind: 'separator', canonical: '\n', required: true });
    line.split(' ').forEach((word, wordIndex) => {
      if (wordIndex > 0) atoms.push({ kind: 'separator', canonical: ' ', required: true });
      atoms.push({ kind: 'literal', text: word });
    });
  });
  return TypingProgramSchema.parse({
    blockId,
    atoms,
    canonicalKeystrokes: countCanonicalKeystrokes(atoms),
  });
}
