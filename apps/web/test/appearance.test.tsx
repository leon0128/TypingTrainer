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

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'ada',
  timezone: 'UTC',
  locale: 'en',
};

const preferences = (appearance: Appearance) => ({
  timezone: 'UTC',
  locale: 'en',
  ...appearance,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const root = () => document.documentElement;
const property = (name: string) => root().style.getPropertyValue(name);

beforeEach(() => {
  useAppearance.setState({ appearance: DEFAULT_APPEARANCE, error: null });
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

    release(json(preferences({ ...DEFAULT_APPEARANCE, fontSize: 24 })));
    await saving;
    expect(JSON.parse(bodies[0] ?? '{}')).toEqual({ fontSize: 24 });
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
