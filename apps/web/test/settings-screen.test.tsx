// @vitest-environment jsdom
import { DEFAULT_APPEARANCE, type Appearance } from '@typing-trainer/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppearance } from '../src/features/appearance/appearance-store';
import { SettingsScreen } from '../src/features/appearance/SettingsScreen';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const echo = (requests: { body: unknown }[]) => (_url: string, init: { body?: string }) => {
  const patch = JSON.parse(init.body ?? '{}') as Partial<Appearance>;
  requests.push({ body: patch });
  return Promise.resolve(
    json({
      timezone: 'UTC',
      locale: 'en',
      soundPack: 'off',
      soundVolume: 30,
      ...DEFAULT_APPEARANCE,
      ...patch,
    }),
  );
};

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/" element={<p>choose a language</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAppearance.setState({ appearance: DEFAULT_APPEARANCE, error: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-preset');
});

describe('the appearance settings screen', () => {
  it('offers every font, size, theme, and colour set, marking the current ones', () => {
    renderScreen();
    const pressed = (group: string) =>
      within(screen.getByRole('group', { name: group }))
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-pressed') === 'true')
        .map((button) => button.textContent.trim());

    expect(within(screen.getByRole('group', { name: 'Font' })).getAllByRole('button')).toHaveLength(
      5,
    );
    expect(within(screen.getByRole('group', { name: 'Size' })).getAllByRole('button')).toHaveLength(
      5,
    );
    expect(
      within(screen.getByRole('group', { name: 'Theme' })).getAllByRole('button'),
    ).toHaveLength(4);
    expect(
      within(screen.getByRole('group', { name: 'Colors' })).getAllByRole('button'),
    ).toHaveLength(3);
    expect(pressed('Font')).toEqual(['JetBrains Mono']);
    expect(pressed('Size')).toEqual(['18 px']);
    expect(pressed('Theme')).toEqual(['System']);
    expect(pressed('Colors')).toEqual(['Standard']);
  });

  it('previews the states a colour set has to keep apart', () => {
    renderScreen();
    const preview = within(screen.getByRole('region', { name: 'Preview' }));
    const code = preview.getByLabelText('Code to type');
    expect(code.querySelector('.cell-typed')).not.toBeNull();
    expect(code.querySelector('.cell-cursor')).not.toBeNull();
    expect(code.querySelector('.cell-pending')).not.toBeNull();
    expect(code.querySelector('.cell-auto-pending')).not.toBeNull();
    expect(preview.getByText('miss')).toBeTruthy();
  });

  it('applies a choice at once and sends only that choice', async () => {
    const requests: { body: unknown }[] = [];
    vi.stubGlobal('fetch', echo(requests));
    renderScreen();

    await userEvent.click(screen.getByRole('button', { name: '24 px' }));
    expect(document.documentElement.style.getPropertyValue('--code-size')).toBe('24px');
    await userEvent.click(screen.getByRole('button', { name: 'Monochrome' }));
    await userEvent.click(screen.getByRole('button', { name: 'High contrast' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fira Code' }));

    expect(requests.map((request) => request.body)).toEqual([
      { fontSize: 24 },
      { colorPreset: 'monochrome' },
      { theme: 'high-contrast' },
      { font: 'fira-code' },
    ]);
    expect(document.documentElement.getAttribute('data-theme')).toBe('high-contrast');
    expect(document.documentElement.getAttribute('data-preset')).toBe('monochrome');
    expect(screen.getByRole('button', { name: '24 px' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '18 px' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('says so, and keeps the old choice, when saving fails', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        json({ statusCode: 500, error: 'Internal Server Error', message: 'try again' }, 500),
      ),
    );
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: '14 px' }));
    expect((await screen.findByRole('alert')).textContent).toBe('try again');
    expect(screen.getByRole('button', { name: '18 px' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('links back to language selection', async () => {
    renderScreen();
    await userEvent.click(screen.getByRole('link', { name: 'Choose a language' }));
    expect(await screen.findByText('choose a language')).toBeTruthy();
  });
});
