import { useEffect, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import { SettingsScreen } from './features/appearance/SettingsScreen';
import { followSystemTheme, useAppearance } from './features/appearance/appearance-store';
import { useAuthStore } from './features/auth/auth-store';
import { LoginScreen } from './features/auth/LoginScreen';
import { AccountScreen } from './features/auth/AccountScreen';
import { RegisterScreen } from './features/auth/RegisterScreen';
import { StartupScreen } from './features/auth/StartupScreen';
import { LanguageScreen } from './features/languages/LanguageScreen';
import { ConquestsScreen } from './features/conquests/ConquestsScreen';
import { DashboardScreen } from './features/dashboard/DashboardScreen';
import { HistoryScreen } from './features/history/HistoryScreen';
import { RankingsScreen } from './features/rankings/RankingsScreen';
import { PlayScreen } from './features/play/PlayScreen';
import { AppLayout } from './components/AppLayout';

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
  useEffect(() => {
    void load();
  }, [load]);
  // Each account has its own look: fetched on sign-in, dropped on sign-out (§8.2).
  useEffect(() => {
    if (status === 'signed-in') void loadAppearance();
    else if (status === 'anonymous') resetAppearance();
  }, [status, loadAppearance, resetAppearance]);
  useEffect(() => followSystemTheme(), []);

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
        <Route path="/" element={<LanguageScreen />} />
        <Route path="/play" element={<PlayScreen />} />
        <Route path="/rankings" element={<RankingsScreen />} />
        <Route path="/account" element={<AccountScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/conquests" element={<ConquestsScreen />} />
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
