/** The subset of a keyboard event the engine needs. Structurally compatible with `KeyboardEvent`. */
export interface KeyInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly isComposing: boolean;
}

export type KeyDisposition =
  /** Feed `key` to `handleKey`. The caller should `preventDefault()` (this blocks Tab focus moves). */
  | { readonly type: 'engine'; readonly key: string }
  /** A browser shortcut (Ctrl or Meta held): leave the event untouched and do not count it. */
  | { readonly type: 'passthrough' }
  /** Modifier-only, navigation, Backspace, dead keys, and similar: not a keystroke. */
  | { readonly type: 'ignore' }
  /** An IME is composing; the player must turn it off (§3.7). */
  | { readonly type: 'ime' };

/** Decides how a keydown is handled, per §3.7. */
export function classifyKey(input: KeyInput): KeyDisposition {
  if (input.isComposing || input.key === 'Process') return { type: 'ime' };
  if (input.ctrlKey || input.metaKey) return { type: 'passthrough' };
  if (input.key === 'Enter' || input.key === 'Tab') return { type: 'engine', key: input.key };
  // Named keys ("Shift", "Backspace", "Dead", ...) are longer than one code point.
  if (Array.from(input.key).length === 1) return { type: 'engine', key: input.key };
  return { type: 'ignore' };
}
