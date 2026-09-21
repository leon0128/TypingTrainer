import { useTranslation } from '../../i18n';
import { useAuthStore } from './auth-store';
import { Logo } from '../../components/Logo';

/** Shown while the first `me` request is in flight, and when it failed (§9.6: no SLA, retry). */
export function StartupScreen() {
  const { t } = useTranslation();
  const startupError = useAuthStore((state) => state.startupError);
  const load = useAuthStore((state) => state.load);

  return (
    <main
      className="ui-page mx-auto flex max-w-md flex-col gap-4 p-6"
      aria-busy={startupError === null}
    >
      <Logo />
      {startupError === null ? (
        <p role="status">{t('common.loading')}</p>
      ) : (
        <>
          <p role="alert">{startupError}</p>
          <button className="ui-btn self-start" type="button" onClick={() => void load()}>
            {t('common.tryAgain')}
          </button>
        </>
      )}
    </main>
  );
}
