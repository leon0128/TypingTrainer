import { useEffect, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import { useAuthStore } from './features/auth/auth-store';
import { LoginScreen } from './features/auth/LoginScreen';
import { RegisterScreen } from './features/auth/RegisterScreen';
import { StartupScreen } from './features/auth/StartupScreen';
import { LanguageScreen } from './features/languages/LanguageScreen';
import { RankingsScreen } from './features/rankings/RankingsScreen';
import { PlayScreen } from './features/play/PlayScreen';

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
  useEffect(() => {
    void load();
  }, [load]);

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
        path="/"
        element={
          <RequireAuth>
            <LanguageScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/play"
        element={
          <RequireAuth>
            <PlayScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/rankings"
        element={
          <RequireAuth>
            <RankingsScreen />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
