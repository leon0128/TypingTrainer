import type { SessionLog, TypingProgram } from '@typing-trainer/contracts';
import { ENTER_KEY, SPACE_KEY, buildSessionLog } from '@typing-trainer/typing-engine';

/**
 * The keys a player types for a block: every literal character and every required separator. Auto
 * and padding atoms are inserted by the engine, and optional separators may be skipped.
 */
export function canonicalKeys(program: TypingProgram): string[] {
  const keys: string[] = [];
  for (const atom of program.atoms) {
    if (atom.kind === 'literal') keys.push(...Array.from(atom.text));
    else if (atom.kind === 'separator' && atom.required) {
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
