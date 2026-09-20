import type { ContentLanguage, Language } from '@typing-trainer/contracts';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { useAuthStore } from '../auth/auth-store';
import { describeError } from '../../lib/api/describe-error';
import { listLanguages } from '../../lib/api/languages';
import { startSession } from '../../lib/api/play';
import { useRunSession } from '../play/run-session';

/** Language selection (F-03): pick a language and the server issues a run of 20 blocks. */
export function LanguageScreen() {
  const navigate = useNavigate();
  const begin = useRunSession((state) => state.begin);
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  const [languages, setLanguages] = useState<Language[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<ContentLanguage | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listLanguages(controller.signal)
      .then(setLanguages)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(describeError(cause));
      });
    return () => {
      controller.abort();
    };
  }, []);

  const start = (language: ContentLanguage) => {
    if (starting !== null) return;
    setStarting(language);
    setError(null);
    startSession(language)
      .then((issued) => {
        // The run time is measured from here: idle counts from the moment the run was issued.
        begin(issued, performance.now());
        void navigate('/play');
      })
      .catch((cause: unknown) => {
        setError(describeError(cause));
        setStarting(null);
      });
  };

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">TypingTrainer</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link className="underline" to="/rankings">
            Rankings
          </Link>
          <Link className="underline" to="/dashboard">
            Dashboard
          </Link>
          <Link className="underline" to="/history">
            History
          </Link>
          {user !== null && (
            <p className="flex items-center gap-3">
              <span>{user.username}</span>
              <button className="underline" type="button" onClick={() => void signOut()}>
                Sign out
              </button>
            </p>
          )}
        </div>
      </header>

      <h2 className="text-lg">Choose a language</h2>

      {error !== null && (
        <p
          className="rounded border border-red-500 px-3 py-2 text-red-700 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}

      {languages === null ? (
        <p role="status">Loading languages…</p>
      ) : languages.length === 0 ? (
        <p role="status">No language is available to play right now.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {languages.map((language) => (
            <li key={language.slug}>
              <button
                className="w-full rounded border border-slate-400 px-3 py-4 disabled:opacity-60 hover:bg-slate-200 dark:hover:bg-slate-800"
                type="button"
                disabled={starting !== null}
                onClick={() => {
                  start(language.slug);
                }}
              >
                {starting === language.slug ? 'Starting…' : language.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm text-slate-600 dark:text-slate-400">
        A run lasts 120 seconds over 20 blocks. The countdown starts with your first keystroke.
      </p>
    </main>
  );
}
