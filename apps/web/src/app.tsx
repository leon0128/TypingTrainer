import { useEffect, type ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';

import { SettingsScreen } from './features/appearance/SettingsScreen';
import {
  followSystemTheme,
  useAppearance,
  whenSaved,
} from './features/appearance/appearance-store';
import { useAuthStore } from './features/auth/auth-store';
import { LoginScreen } from './features/auth/LoginScreen';
import { AccountScreen } from './features/auth/AccountScreen';
import { RegisterScreen } from './features/auth/RegisterScreen';
import { StartupScreen } from './features/auth/StartupScreen';
import { HomeScreen } from './features/home/HomeScreen';
import { TrackLayout } from './features/tracks/TrackLayout';
import { TrackStartScreen } from './features/tracks/TrackStartScreen';
import { useLanguageStore } from './features/tracks/language-store';
import './features/tracks/tracks.css';
import { ConquestsScreen } from './features/conquests/ConquestsScreen';
import { DashboardScreen } from './features/dashboard/DashboardScreen';
import { HistoryScreen } from './features/history/HistoryScreen';
import { RankingsScreen } from './features/rankings/RankingsScreen';
import { PlayScreen } from './features/play/PlayScreen';
import { useTranslation } from './i18n';
import { AppLayout } from './components/AppLayout';
import { trackOfSegment } from './features/tracks/tracks';

/** The screens outside any track, and the screens under one, by the key of their name. */
const TITLE_KEYS = {
  '/': 'common.chooseLanguage',
  '/play': 'nav.play',
  '/account': 'nav.account',
  '/settings': 'nav.appearance',
  '/login': 'auth.signIn',
  '/register': 'auth.createTitle',
} as const;

const TRACK_SCREEN_KEYS = {
  conquests: 'nav.conquests',
  rankings: 'nav.rankings',
  dashboard: 'nav.dashboard',
  history: 'nav.history',
} as const;

/** Keeps the tab title in step with the screen: "Typing Trainer - <screen>". */
function usePageTitle(): void {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [, first, second] = pathname.split('/');
  const key =
    trackOfSegment(first) === null
      ? (TITLE_KEYS as Partial<Record<string, (typeof TITLE_KEYS)[keyof typeof TITLE_KEYS]>>)[
          pathname
        ]
      : second === undefined
        ? 'nav.play'
        : (
            TRACK_SCREEN_KEYS as Partial<
              Record<string, (typeof TRACK_SCREEN_KEYS)[keyof typeof TRACK_SCREEN_KEYS]>
            >
          )[second];
  const screen = key === undefined ? null : t(key);
  useEffect(() => {
    document.title = screen === null ? 'Typing Trainer' : `Typing Trainer - ${screen}`;
  }, [screen]);
}

/** The screens that were not yet in a track: they are the code track's now (§13.9). */
const LEGACY_SCREENS = ['conquests', 'rankings', 'dashboard', 'history'] as const;

/** Screens that need a session; an ended session lands here as `anonymous` and goes to sign-in. */
function RequireAuth({ children }: { children: ReactElement }): ReactElement {
  const status = useAuthStore((state) => state.status);
  if (status === 'loading') return <StartupScreen />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return children;
}

/** Sign-in and registration: pointless once signed in, so they redirect to the app. */
function RequireAnonymous({ children }: { children: ReactElement }): ReactElement {
  const status = useAuthStore((state) => state.status);
  if (status === 'loading') return <StartupScreen />;
  if (status === 'signed-in') return <Navigate to="/" replace />;
  return children;
}

export function App() {
  const load = useAuthStore((state) => state.load);
  const status = useAuthStore((state) => state.status);
  const loadAppearance = useAppearance((state) => state.load);
  const resetAppearance = useAppearance((state) => state.reset);
  const locale = useAppearance((state) => state.locale);
  const loadLanguages = useLanguageStore((state) => state.load);
  const resetLanguages = useLanguageStore((state) => state.reset);
  useEffect(() => {
    void load();
  }, [load]);
  // Each account has its own look: fetched on sign-in, dropped on sign-out (§8.2).
  useEffect(() => {
    if (status === 'signed-in') void loadAppearance();
    else if (status === 'anonymous') resetAppearance();
  }, [status, loadAppearance, resetAppearance]);
  // The languages the account may use (§13.11) are read on sign-in, and again once a change of the
  // display language has been saved, since the server lists Japanese only for a Japanese account.
  useEffect(() => {
    if (status === 'signed-in') void loadLanguages();
    else if (status === 'anonymous') resetLanguages();
  }, [status, loadLanguages, resetLanguages]);
  useEffect(() => {
    if (status !== 'signed-in') return;
    let current = true;
    void whenSaved().then(() => {
      if (current) void loadLanguages();
    });
    return () => {
      current = false;
    };
  }, [locale, status, loadLanguages]);
  useEffect(() => followSystemTheme(), []);
  usePageTitle();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RequireAnonymous>
            <LoginScreen />
          </RequireAnonymous>
        }
      />
      <Route
        path="/register"
        element={
          <RequireAnonymous>
            <RegisterScreen />
          </RequireAnonymous>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomeScreen />} />
        <Route path="/play" element={<PlayScreen />} />
        <Route path="/account" element={<AccountScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path=":track" element={<TrackLayout />}>
          <Route index element={<TrackStartScreen />} />
          <Route path="conquests" element={<ConquestsScreen />} />
          <Route path="rankings" element={<RankingsScreen />} />
          <Route path="dashboard" element={<DashboardScreen />} />
          <Route path="history" element={<HistoryScreen />} />
        </Route>
      </Route>
      {LEGACY_SCREENS.map((screen) => (
        <Route
          key={screen}
          path={`/${screen}`}
          element={<Navigate to={`/code/${screen}`} replace />}
        />
      ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
