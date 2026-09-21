// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '../src/components/AppLayout';
import { useAuthStore } from '../src/features/auth/auth-store';
import { useLeaveGuard } from '../src/features/nav/leave-guard';

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'ada',
  displayName: null,
  timezone: 'UTC',
  locale: 'en' as const,
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<p>home page</p>} />
          <Route path="/rankings" element={<p>rankings page</p>} />
          <Route path="/history" element={<p>history page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuthStore.setState({ status: 'signed-in', user: USER, startupError: null });
});

afterEach(() => {
  cleanup();
  useLeaveGuard.getState().set(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the shared header', () => {
  it('shows every place to go, on whichever screen it sits above', () => {
    renderAt('/history');
    const menu = within(screen.getByRole('navigation', { name: 'Menu' }));
    expect(menu.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'homeHome',
      'military_techCPU battles',
      'leaderboardHigh scores',
      'insightsStatus',
      'historyPlay log',
      'paletteSettings',
    ]);
    expect(screen.getByText('history page')).toBeTruthy();
    expect(menu.getByRole('link', { name: 'Play log' }).getAttribute('aria-current')).toBe('page');
    expect(menu.getByRole('link', { name: 'Status' }).getAttribute('aria-current')).toBeNull();
  });

  it('follows a link, and the logo leads home', async () => {
    renderAt('/history');
    await userEvent.click(screen.getByRole('link', { name: 'High scores' }));
    expect(await screen.findByText('rankings page')).toBeTruthy();
    await userEvent.click(screen.getByRole('link', { name: 'TypingTrainer' }));
    expect(await screen.findByText('home page')).toBeTruthy();
    await userEvent.click(screen.getByRole('link', { name: 'High scores' }));
    await userEvent.click(screen.getByRole('link', { name: 'Home' }));
    expect(await screen.findByText('home page')).toBeTruthy();
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
    await userEvent.click(screen.getByRole('link', { name: 'High scores' }));
    expect(confirm).toHaveBeenLastCalledWith('Leave?');
    expect(screen.queryByText('rankings page')).toBeNull();

    confirm.mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole('link', { name: 'High scores' }));
    expect(await screen.findByText('rankings page')).toBeTruthy();
  });
});
