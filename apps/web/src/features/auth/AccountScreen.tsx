import { useId, useState, type SubmitEventHandler } from 'react';
import { Link, useNavigate } from 'react-router';

import { useTranslation } from '../../i18n';
import { deleteAccount } from '../../lib/api/auth';
import { describeError } from '../../lib/api/describe-error';
import { useAuthStore } from './auth-store';

/**
 * The account (F-15): who it is, and how to erase it. Erasing takes the password again and an
 * acknowledgement that it cannot be undone (§7, Q19); nothing is sent until both are given.
 */
export function AccountScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const accountDeleted = useAuthStore((state) => state.accountDeleted);
  const passwordId = useId();
  const [password, setPassword] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = password !== '' && understood && !busy;

  const submit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    if (!ready) return;
    setError(null);
    setBusy(true);
    deleteAccount(password)
      .then(() => {
        // The account and its sessions are gone on the server; drop it here without asking again.
        accountDeleted();
        void navigate('/login', { replace: true });
      })
      .catch((cause: unknown) => {
        setError(describeError(cause));
        setBusy(false);
      });
  };

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold">{t('account.title')}</h1>
        <Link className="underline" to="/">
          {t('common.chooseLanguage')}
        </Link>
      </header>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt>{t('account.username')}</dt>
        <dd>{user?.username}</dd>
        <dt>{t('account.timezone')}</dt>
        <dd>{user?.timezone}</dd>
      </dl>

      <section
        aria-labelledby="delete-heading"
        className="flex flex-col gap-3 rounded border border-red-500 p-4"
      >
        <h2 id="delete-heading" className="text-lg font-medium text-red-700 dark:text-red-400">
          {t('account.deleteHeading')}
        </h2>
        <p>{t('account.warning')}</p>

        <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor={passwordId}>{t('account.password')}</label>
            <input
              id={passwordId}
              className="rounded border border-slate-400 bg-white px-3 py-2 dark:bg-slate-900"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              autoComplete="current-password"
            />
          </div>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={understood}
              onChange={(event) => {
                setUnderstood(event.target.checked);
              }}
            />
            {t('account.acknowledge')}
          </label>

          {error !== null && (
            <p
              className="rounded border border-red-500 px-3 py-2 text-red-700 dark:text-red-400"
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            className="self-start rounded bg-red-700 px-3 py-2 text-white disabled:opacity-50"
            type="submit"
            disabled={!ready}
          >
            {busy ? t('account.deleting') : t('account.delete')}
          </button>
        </form>
      </section>
    </main>
  );
}
