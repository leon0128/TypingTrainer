import { shortestSpelling, type SessionLog, type TypingProgram } from '@typing-trainer/contracts';
import {
  ENTER_KEY,
  SPACE_KEY,
  buildSessionLog,
  withTypedClosers,
} from '@typing-trainer/typing-engine';

/**
 * The keys a player types for a block: every literal character and every required separator. Closing
 * brackets are typed too; only indentation and padding are inserted by the engine, and optional
 * separators may be skipped.
 */
export function canonicalKeys(program: TypingProgram): string[] {
  const keys: string[] = [];
  for (const atom of withTypedClosers(program).atoms) {
    if (atom.kind === 'literal') keys.push(...Array.from(atom.text));
    else if (atom.kind === 'romaji') keys.push(...Array.from(shortestSpelling(atom)));
    else if (atom.kind === 'separator' && atom.required) {
      keys.push(atom.canonical === '\n' ? ENTER_KEY : SPACE_KEY);
    }
  }
  return keys;
}

/**
 * The keys of the longest way to type a block: as `canonicalKeys`, but every Japanese unit spelled
 * with its longest spelling (`shi`, not `si`), the way §13.5 counts the most keys a run can reach.
 */
export function longestKeys(program: TypingProgram): string[] {
  const keys: string[] = [];
  for (const atom of program.atoms) {
    if (atom.kind === 'literal') keys.push(...Array.from(atom.text));
    else if (atom.kind === 'romaji') {
      const longest = atom.alternatives.reduce((most, next) =>
        next.length > most.length ? next : most,
      );
      keys.push(...Array.from(longest));
    } else if (atom.kind === 'separator' && atom.required) {
      keys.push(atom.canonical === '\n' ? ENTER_KEY : SPACE_KEY);
    }
  }
  return keys;
}

/** A log of the given keys, evenly spaced, starting at 0 as the countdown does (§4.1). */
export function logOf(keys: readonly string[], stepMs: number): SessionLog {
  return buildSessionLog(keys.map((key, index) => ({ key, activeMs: index * stepMs })));
}

/** A log of the first `count` keys of a run, typed correctly. */
export function correctLog(
  blocks: readonly TypingProgram[],
  count: number,
  stepMs: number,
): SessionLog {
  return logOf(blocks.flatMap(canonicalKeys).slice(0, count), stepMs);
}
