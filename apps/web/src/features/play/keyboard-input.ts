import { classifyKey } from '@typing-trainer/typing-engine';

/** The hidden input the play screen keeps focused (§3.7). HTMLInputElement satisfies this. */
export interface KeyboardTarget extends EventTarget {
  value: string;
}

export interface KeyboardCallbacks {
  /** An engine key, with the keydown's timestamp (performance.now() time base). */
  onKey(key: string, timeStamp: number): void;
  /** Whether an IME is composing; the screen asks the player to turn it off. */
  onImeChange(active: boolean): void;
  /** Caps Lock as the latest key saw it; reported only when it changes. */
  onCapsLock?(on: boolean): void;
  onBlur(now: number): void;
  onFocus(now: number): void;
}

/**
 * Wires keyboard events on `target` to the engine. Framework-free so it can be tested without a
 * DOM. Returns a function that removes every listener.
 */
export function attachKeyboardInput(
  target: KeyboardTarget,
  callbacks: KeyboardCallbacks,
  now: () => number = () => performance.now(),
): () => void {
  let capsLock = false;
  const onKeyDown = (event: Event) => {
    const keyboard = event as KeyboardEvent;
    if (typeof keyboard.getModifierState === 'function') {
      const caps = keyboard.getModifierState('CapsLock');
      if (caps !== capsLock) {
        capsLock = caps;
        callbacks.onCapsLock?.(caps);
      }
    }
    const disposition = classifyKey(keyboard);
    switch (disposition.type) {
      case 'engine':
        // Also blocks Tab from moving focus; the engine judges it as a miss.
        event.preventDefault();
        callbacks.onKey(disposition.key, keyboard.timeStamp);
        target.value = '';
        break;
      case 'ignore':
        event.preventDefault();
        target.value = '';
        break;
      case 'passthrough':
        // Browser shortcuts (Ctrl/Meta) are left untouched.
        break;
      case 'ime':
        // Clearing the value mid-composition can corrupt the candidate window or caret on some
        // browsers and IMEs; leave it alone and clear on compositionend instead.
        callbacks.onImeChange(true);
        break;
    }
  };
  const onCompositionStart = () => {
    callbacks.onImeChange(true);
  };
  const onCompositionEnd = () => {
    target.value = '';
    callbacks.onImeChange(false);
  };
  const onBlur = () => {
    callbacks.onBlur(now());
  };
  const onFocus = () => {
    callbacks.onFocus(now());
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('compositionstart', onCompositionStart);
  target.addEventListener('compositionend', onCompositionEnd);
  target.addEventListener('blur', onBlur);
  target.addEventListener('focus', onFocus);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('compositionstart', onCompositionStart);
    target.removeEventListener('compositionend', onCompositionEnd);
    target.removeEventListener('blur', onBlur);
    target.removeEventListener('focus', onFocus);
  };
}
