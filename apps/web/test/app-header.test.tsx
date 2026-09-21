// @vitest-environment jsdom
import type { Language } from '@typing-trainer/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '../src/components/AppLayout';
import { useAuthStore } from '../src/features/auth/auth-store';
import { useLeaveGuard } from '../src/features/nav/leave-guard';
import { useLanguageStore } from '../src/features/tracks/language-store';

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'ada',
  displayName: null,
  timezone: 'UTC',
  locale: 'en' as const,
};

const PYTHON: Language = { slug: 'python', displayName: 'Python', track: 'code', kind: null };
const ENGLISH: Language = {
  slug: 'en-word',
  displayName: 'English words',
  track: 'natural-en',
  kind: 'word',
};
const JAPANESE: Language = {
  slug: 'ja-word',
  displayName: 'Japanese words',
  track: 'natural-ja',
  kind: 'word',
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<p>home page</p>} />
          <Route path="/code" element={<p>code page</p>} />
          <Route path="/en" element={<p>english page</p>} />
          <Route path="/ja" element={<p>japanese page</p>} />
          <Route path="/settings" element={<p>settings page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const switchLinks = () =>
  within(screen.getByRole('group', { name: 'Tracks' })).getAllByRole('link');

beforeEach(() => {
  useAuthStore.setState({ status: 'signed-in', user: USER, startupError: null });
  useLanguageStore.setState({ languages: [PYTHON, ENGLISH], error: null });
});

afterEach(() => {
  cleanup();
  useLeaveGuard.getState().set(null);
  useLanguageStore.getState().reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the shared header', () => {
  it('offers the tracks the server lists a language for, and not the Japanese one otherwise', () => {
    renderAt('/');
    expect(switchLinks().map((link) => link.textContent)).toEqual(['Code', 'English']);
    expect(screen.queryByRole('link', { name: 'Japanese' })).toBeNull();
    expect(screen.queryByText('日本語')).toBeNull();
  });

  it('offers all three tracks when the account may use Japanese', () => {
    useLanguageStore.setState({ languages: [PYTHON, ENGLISH, JAPANESE], error: null });
    renderAt('/');
    expect(switchLinks().map((link) => link.textContent)).toEqual(['Code', 'Japanese', 'English']);
  });

  it('offers no track before the languages have arrived', () => {
    useLanguageStore.setState({ languages: null });
    renderAt('/');
    expect(screen.queryByRole('group', { name: 'Tracks' })).toBeNull();
  });

  it('marks the track of the screen shown, and none on the home screen', () => {
    renderAt('/en');
    expect(screen.getByText('english page')).toBeTruthy();
    const current = switchLinks().filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.textContent)).toEqual(['English']);
    cleanup();
    renderAt('/');
    expect(switchLinks().filter((link) => link.getAttribute('aria-current') === 'page')).toEqual(
      [],
    );
  });

  it('follows a track, the logo leads home, and the settings are apart from the tracks', async () => {
    renderAt('/');
    await userEvent.click(screen.getByRole('link', { name: 'English' }));
    expect(await screen.findByText('english page')).toBeTruthy();
    await userEvent.click(screen.getByRole('link', { name: 'TypingTrainer' }));
    expect(await screen.findByText('home page')).toBeTruthy();
    const menu = within(screen.getByRole('navigation', { name: 'Menu' }));
    expect(menu.getAllByRole('link').map((link) => link.textContent)).toEqual(['paletteSettings']);
    await userEvent.click(menu.getByRole('link', { name: 'Settings' }));
    expect(await screen.findByText('settings page')).toBeTruthy();
  });

  it('names the player, apart from the links, and has no sign-out', () => {
    renderAt('/');
    const menu = screen.getByRole('navigation', { name: 'Menu' });
    expect(within(menu).queryByText('ada')).toBeNull();
    expect(screen.getByRole('link', { name: /ada/ }).getAttribute('href')).toBe('/account');
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
  });

  it('asks first when the screen has something to lose, and stays on "cancel"', async () => {
    useLeaveGuard.getState().set('Leave?');
    const confirm = vi.spyOn(window, 'confirm');
    renderAt('/');

    confirm.mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole('link', { name: 'English' }));
    expect(confirm).toHaveBeenLastCalledWith('Leave?');
    expect(screen.queryByText('english page')).toBeNull();

    confirm.mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole('link', { name: 'English' }));
    expect(await screen.findByText('english page')).toBeTruthy();
  });
});
