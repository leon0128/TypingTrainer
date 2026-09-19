import { RegisterRequestSchema, PASSWORD_MIN_LENGTH } from '@typing-trainer/contracts';
import { Link, useNavigate } from 'react-router';

import * as authApi from '../../lib/api/auth';
import { useAuthStore } from './auth-store';
import { CredentialsForm } from './CredentialsForm';

/** The browser's own time zone, which the profile uses for day boundaries (§6.4). */
function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function RegisterScreen() {
  const navigate = useNavigate();
  const signedIn = useAuthStore((state) => state.signedIn);

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Create an account</h1>
      <CredentialsForm
        submitLabel="Create account"
        passwordAutoComplete="new-password"
        hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters. A phrase you can type is fine.`}
        // The same schema the API validates with, so the rules cannot drift apart (§9.4).
        validate={(username, password) => {
          const parsed = RegisterRequestSchema.safeParse({ username, password });
          return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Check your details.');
        }}
        onSubmit={async (username, password) => {
          signedIn(await authApi.register({ username, password, timezone: browserTimezone() }));
          void navigate('/', { replace: true });
        }}
      />
      <p>
        Already have an account?{' '}
        <Link className="underline" to="/login">
          Sign in
        </Link>
        .
      </p>
    </main>
  );
}
