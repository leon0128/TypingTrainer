import type { Atom, RomajiAtom } from '@typing-trainer/contracts';

/**
 * How many keys a block can take and which spelling the CPU types (§13.5). These repeat
 * `shortestSpelling` and `countMaxKeystrokes` of `contracts`, because the engine may import only
 * types from there (no zod code in the bundle); a test keeps the two in agreement.
 */

/** The shortest spelling of a romaji unit; the first of them when several are as short. */
export function shortestSpelling(atom: RomajiAtom): string {
  let shortest = atom.alternatives[0] ?? '';
  for (const spelling of atom.alternatives) {
    if (spelling.length < shortest.length) shortest = spelling;
  }
  return shortest;
}

/**
 * The keys of the longest way to type the atoms: literal characters, separators, and the longest
 * spelling of every romaji unit. Japanese effective keystrokes count every key pressed, so this is
 * what a run over these blocks can reach at most.
 */
export function maxKeystrokes(atoms: readonly Atom[]): number {
  let total = 0;
  for (const atom of atoms) {
    if (atom.kind === 'literal') total += atom.text.length;
    else if (atom.kind === 'separator') total += 1;
    else if (atom.kind === 'romaji') {
      total += atom.alternatives.reduce(
        (longest, spelling) => Math.max(longest, spelling.length),
        0,
      );
    }
  }
  return total;
}
