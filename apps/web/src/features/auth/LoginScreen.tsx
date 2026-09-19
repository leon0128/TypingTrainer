import { Link, useNavigate } from 'react-router';

import * as authApi from '../../lib/api/auth';
import { useAuthStore } from './auth-store';
import { CredentialsForm } from './CredentialsForm';

export function LoginScreen() {
  const navigate = useNavigate();
  const signedIn = useAuthStore((state) => state.signedIn);

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <CredentialsForm
        submitLabel="Sign in"
        passwordAutoComplete="current-password"
        validate={(username, password) =>
          username === '' || password === '' ? 'Enter your username and password.' : null
        }
        onSubmit={async (username, password) => {
          signedIn(await authApi.login({ username, password }));
          void navigate('/', { replace: true });
        }}
      />
      <p>
        No account yet?{' '}
        <Link className="underline" to="/register">
          Create one
        </Link>
        .
      </p>
    </main>
  );
}
