// @vitest-environment jsdom
import { DEFAULT_APPEARANCE, type Appearance } from '@typing-trainer/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/app';
import { applyAppearance, resolveTheme } from '../src/features/appearance/apply';
import { useAppearance } from '../src/features/appearance/appearance-store';
import { fontStack } from '../src/features/appearance/fonts';
import { PALETTES } from '../src/features/appearance/palettes';
import { useAuthStore } from '../src/features/auth/auth-store';
import { soundPlayer } from '../src/features/sound/sound';

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'ada',
  timezone: 'UTC',
  locale: 'en',
};

const preferences = (appearance: Appearance) => ({
  timezone: 'UTC',
  locale: 'en',
  soundPack: 'off',
  soundVolume: 30,
  ...appearance,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const root = () => document.documentElement;
const property = (name: string) => root().style.getPropertyValue(name);

beforeEach(() => {
  useAppearance.setState({
    appearance: DEFAULT_APPEARANCE,
    sound: { soundPack: 'off', soundVolume: 30 },
    error: null,
  });
  useAuthStore.setState({ status: 'loading', user: null, startupError: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  root().removeAttribute('style');
  root().removeAttribute('data-theme');
  root().removeAttribute('data-preset');
});

describe('resolveTheme', () => {
  it('follows the operating system only for system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    for (const systemDark of [true, false]) {
      expect(resolveTheme('light', systemDark)).toBe('light');
      expect(resolveTheme('dark', systemDark)).toBe('dark');
      expect(resolveTheme('high-contrast', systemDark)).toBe('high-contrast');
    }
  });
});

describe('applyAppearance', () => {
  it('sets every colour of the palette, the font, the size, and the theme markers', () => {
    applyAppearance(
      { font: 'fira-code', fontSize: 24, theme: 'high-contrast', colorPreset: 'okabe-ito' },
      false,
    );
    const palette = PALETTES['okabe-ito']['high-contrast'];
    expect(property('--typed')).toBe(palette.typed);
    expect(property('--pending')).toBe(palette.pending);
    expect(property('--auto-pending')).toBe(palette.autoPending);
    expect(property('--cursor-bg')).toBe(palette.cursorBg);
    expect(property('--cursor-fg')).toBe(palette.cursorFg);
    expect(property('--error')).toBe(palette.error);
    expect(property('--error-fg')).toBe(palette.errorFg);
    expect(property('--bg')).toBe(palette.bg);
    expect(property('--code-font')).toBe(fontStack('fira-code'));
    expect(property('--code-size')).toBe('24px');
    expect(root().getAttribute('data-theme')).toBe('high-contrast');
    expect(root().getAttribute('data-preset')).toBe('okabe-ito');
  });

  it('uses the operating system for the system theme', () => {
    applyAppearance(DEFAULT_APPEARANCE, true);
    expect(root().getAttribute('data-theme')).toBe('dark');
    expect(property('--panel')).toBe(PALETTES.standard.dark.panel);
    applyAppearance(DEFAULT_APPEARANCE, false);
    expect(root().getAttribute('data-theme')).toBe('light');
  });

  it('names a fallback after each font, so text shows before the font has loaded', () => {
    expect(fontStack('noto-sans-mono')).toMatch(/^'Noto Sans Mono', .*monospace$/);
  });
});

describe('the appearance store', () => {
  it('loads and applies what the server has', async () => {
    const stored = {
      font: 'ibm-plex-mono',
      fontSize: 20,
      theme: 'dark',
      colorPreset: 'monochrome',
    };
    vi.stubGlobal('fetch', () => Promise.resolve(json(preferences(stored as Appearance))));
    await useAppearance.getState().load();
    expect(useAppearance.getState().appearance).toEqual(stored);
    expect(property('--code-size')).toBe('20px');
    expect(root().getAttribute('data-preset')).toBe('monochrome');
  });

  it('keeps the defaults, and says so, when the settings cannot be loaded', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await useAppearance.getState().load();
    expect(useAppearance.getState().appearance).toEqual(DEFAULT_APPEARANCE);
    expect(useAppearance.getState().error).toMatch(/could not be reached/);
  });

  it('applies a change before the server has answered, and sends only that change', async () => {
    let release: (response: Response) => void = () => undefined;
    const bodies: string[] = [];
    vi.stubGlobal('fetch', (_url: string, init: { body?: string }) => {
      bodies.push(init.body ?? '');
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });

    const saving = useAppearance.getState().change({ fontSize: 24 });
    expect(property('--code-size')).toBe('24px');
    expect(useAppearance.getState().appearance.fontSize).toBe(24);
    await vi.waitFor(() => {
      expect(bodies).toHaveLength(1);
    });

    release(json(preferences({ ...DEFAULT_APPEARANCE, fontSize: 24 })));
    await saving;
    expect(JSON.parse(bodies[0] ?? '{}')).toEqual({ fontSize: 24 });
  });

  it('sends quick changes one after the other, in order', async () => {
    const releases: ((response: Response) => void)[] = [];
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', (_url: string, init: { body?: string }) => {
      bodies.push(JSON.parse(init.body ?? '{}'));
      return new Promise<Response>((resolve) => {
        releases.push(resolve);
      });
    });

    const first = useAppearance.getState().change({ fontSize: 24 });
    const second = useAppearance.getState().change({ theme: 'dark' });
    await vi.waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    // The second waits for the first to be answered, however long that takes.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(bodies).toEqual([{ fontSize: 24 }]);

    releases[0]?.(json(preferences({ ...DEFAULT_APPEARANCE, fontSize: 24 })));
    await first;
    await vi.waitFor(() => {
      expect(bodies).toEqual([{ fontSize: 24 }, { theme: 'dark' }]);
    });
    releases[1]?.(json(preferences({ ...DEFAULT_APPEARANCE, fontSize: 24, theme: 'dark' })));
    await second;
  });

  it('does not let a slow answer undo a later change it knew nothing about', async () => {
    const releases: ((response: Response) => void)[] = [];
    vi.stubGlobal('fetch', () => {
      return new Promise<Response>((resolve) => {
        releases.push(resolve);
      });
    });

    const first = useAppearance.getState().change({ fontSize: 24 });
    const second = useAppearance.getState().change({ colorPreset: 'monochrome' });
    await vi.waitFor(() => {
      expect(releases).toHaveLength(1);
    });
    // The first answer describes a server that has not yet heard of the second change.
    releases[0]?.(json(preferences({ ...DEFAULT_APPEARANCE, fontSize: 24 })));
    await first;
    expect(useAppearance.getState().appearance.colorPreset).toBe('monochrome');
    expect(root().getAttribute('data-preset')).toBe('monochrome');

    await vi.waitFor(() => {
      expect(releases).toHaveLength(2);
    });
    releases[1]?.(
      json(preferences({ ...DEFAULT_APPEARANCE, fontSize: 24, colorPreset: 'monochrome' })),
    );
    await second;
    expect(useAppearance.getState().appearance).toEqual({
      ...DEFAULT_APPEARANCE,
      fontSize: 24,
      colorPreset: 'monochrome',
    });
  });

  it('undoes only the failed change when a later one is on screen', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', () => {
      calls += 1;
      return Promise.resolve(
        calls === 1
          ? json({ statusCode: 500, error: 'Internal Server Error', message: 'try again' }, 500)
          : json(preferences({ ...DEFAULT_APPEARANCE, colorPreset: 'monochrome' })),
      );
    });
    await Promise.all([
      useAppearance.getState().change({ fontSize: 24 }),
      useAppearance.getState().change({ colorPreset: 'monochrome' }),
    ]);
    expect(useAppearance.getState().appearance).toEqual({
      ...DEFAULT_APPEARANCE,
      colorPreset: 'monochrome',
    });
    expect(useAppearance.getState().error).toBe('try again');
  });

  it('goes back to what it was, and says why, when saving fails', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        json({ statusCode: 500, error: 'Internal Server Error', message: 'try again' }, 500),
      ),
    );
    await useAppearance.getState().change({ theme: 'dark' });
    expect(useAppearance.getState().appearance).toEqual(DEFAULT_APPEARANCE);
    expect(useAppearance.getState().error).toBe('try again');
    expect(root().getAttribute('data-theme')).toBe('light');
  });

  it('shows what the server stored rather than what was asked for', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(json(preferences({ ...DEFAULT_APPEARANCE, fontSize: 16 }))),
    );
    await useAppearance.getState().change({ fontSize: 24 });
    expect(useAppearance.getState().appearance.fontSize).toBe(16);
  });
});

describe('the app', () => {
  const renderApp = () =>
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    );

  it("applies the account's appearance on sign-in", async () => {
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(
        url.endsWith('/auth/me')
          ? json({ user: USER })
          : url.endsWith('/preferences')
            ? json(
                preferences({
                  font: 'source-code-pro',
                  fontSize: 14,
                  theme: 'light',
                  colorPreset: 'okabe-ito',
                }),
              )
            : json({ languages: [] }),
      ),
    );
    renderApp();
    await screen.findByText('TypingTrainer');
    await vi.waitFor(() => {
      expect(property('--code-size')).toBe('14px');
    });
    expect(root().getAttribute('data-preset')).toBe('okabe-ito');
  });

  it('drops it on the sign-in screen when nobody is signed in', async () => {
    applyAppearance(
      { font: 'fira-code', fontSize: 24, theme: 'dark', colorPreset: 'monochrome' },
      false,
    );
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        json({ statusCode: 401, error: 'Unauthorized', message: 'authentication required' }, 401),
      ),
    );
    renderApp();
    await vi.waitFor(() => {
      expect(root().getAttribute('data-preset')).toBe('standard');
    });
    expect(property('--code-size')).toBe('18px');
  });
});

describe('key sounds in the store', () => {
  const stored = (soundPack: string, soundVolume: number) => ({
    timezone: 'UTC',
    locale: 'en',
    ...DEFAULT_APPEARANCE,
    soundPack,
    soundVolume,
  });

  it('gives the player what the server has on load, and nothing when it is off', async () => {
    const configure = vi.spyOn(soundPlayer, 'configure');
    vi.stubGlobal('fetch', () => Promise.resolve(json(stored('mechanical', 65))));
    await useAppearance.getState().load();
    expect(useAppearance.getState().sound).toEqual({ soundPack: 'mechanical', soundVolume: 65 });
    expect(configure).toHaveBeenLastCalledWith({ pack: 'mechanical', volume: 65 });
    vi.restoreAllMocks();
  });

  it('is silent by default, for a signed-out visitor too', () => {
    const configure = vi.spyOn(soundPlayer, 'configure');
    useAppearance.getState().reset();
    expect(useAppearance.getState().sound).toEqual({ soundPack: 'off', soundVolume: 30 });
    expect(configure).toHaveBeenLastCalledWith({ pack: 'off', volume: 30 });
    vi.restoreAllMocks();
  });

  it('applies a sound change before the server answers, and undoes it if saving fails', async () => {
    const configure = vi.spyOn(soundPlayer, 'configure');
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        json({ statusCode: 500, error: 'Internal Server Error', message: 'try again' }, 500),
      ),
    );
    const saving = useAppearance.getState().change({ soundPack: 'beep', soundVolume: 80 });
    expect(configure).toHaveBeenCalledWith({ pack: 'beep', volume: 80 });
    await saving;
    expect(useAppearance.getState().sound).toEqual({ soundPack: 'off', soundVolume: 30 });
    expect(configure).toHaveBeenLastCalledWith({ pack: 'off', volume: 30 });
    expect(useAppearance.getState().error).toBe('try again');
    vi.restoreAllMocks();
  });

  it('changes the sound without touching the appearance, and the other way round', async () => {
    vi.stubGlobal('fetch', (_url: string, init: { body?: string }) =>
      Promise.resolve(
        json({
          ...stored('soft', 30),
          ...JSON.parse(init.body ?? '{}'),
        }),
      ),
    );
    await useAppearance.getState().change({ soundPack: 'soft' });
    expect(useAppearance.getState().appearance).toEqual(DEFAULT_APPEARANCE);
    await useAppearance.getState().change({ theme: 'dark' });
    expect(useAppearance.getState().sound).toEqual({ soundPack: 'soft', soundVolume: 30 });
    vi.restoreAllMocks();
  });
});
