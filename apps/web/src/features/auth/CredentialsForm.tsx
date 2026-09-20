import { useId, useState, type SubmitEventHandler } from 'react';

import { useTranslation } from '../../i18n';
import { describeError } from '../../lib/api/describe-error';

export interface CredentialsFormProps {
  readonly submitLabel: string;
  /** Rejects to show its message; resolves once the screen has navigated away. */
  readonly onSubmit: (username: string, password: string) => Promise<void>;
  /** Checked before the request, so obvious mistakes do not cost a round trip. */
  readonly validate?: (username: string, password: string) => string | null;
  readonly passwordAutoComplete: 'current-password' | 'new-password';
  readonly hint?: string;
}

/** The username and password form shared by sign-in and registration (§7). */
export function CredentialsForm({
  submitLabel,
  onSubmit,
  validate,
  passwordAutoComplete,
  hint,
}: CredentialsFormProps) {
  const { t } = useTranslation();
  const usernameId = useId();
  const passwordId = useId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    if (busy) return;
    const problem = validate?.(username, password) ?? null;
    if (problem !== null) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    void onSubmit(username, password)
      .catch((cause: unknown) => {
        setError(describeError(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor={usernameId}>{t('auth.username')}</label>
        <input
          id={usernameId}
          className="rounded border border-slate-400 bg-white px-3 py-2 dark:bg-slate-900"
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
          }}
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={passwordId}>{t('auth.password')}</label>
        <input
          id={passwordId}
          className="rounded border border-slate-400 bg-white px-3 py-2 dark:bg-slate-900"
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          autoComplete={passwordAutoComplete}
          required
        />
        {hint !== undefined && <p className="text-sm text-slate-600 dark:text-slate-400">{hint}</p>}
      </div>

      {error !== null && (
        <p
          className="rounded border border-red-500 px-3 py-2 text-red-700 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}

      <button
        className="rounded bg-slate-800 px-3 py-2 text-white disabled:opacity-60 dark:bg-slate-200 dark:text-slate-900"
        type="submit"
        disabled={busy}
      >
        {busy ? t('common.working') : submitLabel}
      </button>
    </form>
  );
}
