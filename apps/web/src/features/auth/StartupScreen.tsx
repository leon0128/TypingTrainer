import { useAuthStore } from './auth-store';

/** Shown while the first `me` request is in flight, and when it failed (§9.6: no SLA, retry). */
export function StartupScreen() {
  const startupError = useAuthStore((state) => state.startupError);
  const load = useAuthStore((state) => state.load);

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-6" aria-busy={startupError === null}>
      {startupError === null ? (
        <p role="status">Loading…</p>
      ) : (
        <>
          <p role="alert">{startupError}</p>
          <button
            className="self-start rounded bg-slate-800 px-3 py-2 text-white dark:bg-slate-200 dark:text-slate-900"
            type="button"
            onClick={() => void load()}
          >
            Try again
          </button>
        </>
      )}
    </main>
  );
}
