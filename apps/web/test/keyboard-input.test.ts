import { beforeEach, describe, expect, it, vi } from 'vitest';

import { attachKeyboardInput } from '../src/features/play/keyboard-input';

/**
 * jsdom is not needed: Node provides EventTarget and Event, and the handler only reads `key`,
 * `ctrlKey`, `metaKey`, `isComposing`, and `timeStamp`, which are defined on plain events here.
 * Real IME composition is additionally checked in the browser with dispatched composition events.
 */
class FakeInput extends EventTarget {
  value = 'leftover';
}

function keydown(key: string, init: { isComposing?: boolean; ctrlKey?: boolean } = {}) {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperties(event, {
    key: { value: key },
    ctrlKey: { value: init.ctrlKey ?? false },
    metaKey: { value: false },
    isComposing: { value: init.isComposing ?? false },
  });
  return event;
}

describe('attachKeyboardInput', () => {
  let input: FakeInput;
  const onKey = vi.fn<(key: string, timeStamp: number) => void>();
  const onImeChange = vi.fn<(active: boolean) => void>();
  const onBlur = vi.fn<(now: number) => void>();
  const onFocus = vi.fn<(now: number) => void>();
  const callbacks = { onKey, onImeChange, onBlur, onFocus };

  beforeEach(() => {
    vi.clearAllMocks();
    input = new FakeInput();
    attachKeyboardInput(input, callbacks, () => 42);
  });

  it('feeds engine keys, prevents the default action, and clears the value', () => {
    const event = keydown('Tab');
    input.dispatchEvent(event);
    expect(onKey).toHaveBeenCalledWith('Tab', event.timeStamp);
    expect(event.defaultPrevented).toBe(true);
    expect(input.value).toBe('');
  });

  it('ignores non-keystrokes such as Backspace but still clears the value', () => {
    const event = keydown('Backspace');
    input.dispatchEvent(event);
    expect(onKey).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(input.value).toBe('');
  });

  it('leaves browser shortcuts untouched', () => {
    const event = keydown('c', { ctrlKey: true });
    input.dispatchEvent(event);
    expect(onKey).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(input.value).toBe('leftover');
  });

  it('does not clear the value while an IME is composing, only on compositionend', () => {
    input.dispatchEvent(new Event('compositionstart'));
    const event = keydown('a', { isComposing: true });
    input.dispatchEvent(event);

    expect(onKey).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(input.value).toBe('leftover');
    expect(onImeChange).toHaveBeenCalledWith(true);

    input.dispatchEvent(new Event('compositionend'));
    expect(input.value).toBe('');
    expect(onImeChange).toHaveBeenLastCalledWith(false);
  });

  it('treats the IME "Process" key like composition', () => {
    input.dispatchEvent(keydown('Process'));
    expect(onKey).not.toHaveBeenCalled();
    expect(input.value).toBe('leftover');
    expect(onImeChange).toHaveBeenCalledWith(true);
  });

  it('reports blur and focus with the current time for auto-pause', () => {
    input.dispatchEvent(new Event('blur'));
    input.dispatchEvent(new Event('focus'));
    expect(onBlur).toHaveBeenCalledWith(42);
    expect(onFocus).toHaveBeenCalledWith(42);
  });

  it('removes every listener on detach', () => {
    const other = new FakeInput();
    const detach = attachKeyboardInput(other, callbacks);
    detach();
    other.dispatchEvent(keydown('a'));
    other.dispatchEvent(new Event('compositionend'));
    expect(onKey).not.toHaveBeenCalled();
    expect(other.value).toBe('leftover');
  });
});
