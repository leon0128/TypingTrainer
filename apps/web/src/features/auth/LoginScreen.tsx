import { Link, useNavigate } from 'react-router';

import { useTranslation } from '../../i18n';
import * as authApi from '../../lib/api/auth';
import { useAuthStore } from './auth-store';
import { CredentialsForm } from './CredentialsForm';
import { LanguageToggle } from './LanguageToggle';
import { Logo } from '../../components/Logo';

export function LoginScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Set when the account screen has just erased the account (F-15).
  const erased = useAuthStore((state) => state.accountErased);
  const signedIn = useAuthStore((state) => state.signedIn);

  return (
    <main className="ui-page mx-auto flex max-w-sm flex-col gap-6 p-6">
      <Logo />
      <LanguageToggle />
      {erased && <p role="status">{t('account.deletedNotice')}</p>}
      <h1 className="ui-title text-2xl font-semibold">{t('auth.signIn')}</h1>
      <CredentialsForm
        submitLabel={t('auth.signIn')}
        passwordAutoComplete="current-password"
        validate={(username, password) =>
          username === '' || password === '' ? t('auth.enterBoth') : null
        }
        onSubmit={async (username, password) => {
          signedIn(await authApi.login({ username, password }));
          void navigate('/', { replace: true });
        }}
      />
      <p>
        {t('auth.noAccount')}{' '}
        <Link className="underline" to="/register">
          {t('auth.createOne')}
        </Link>
        .
      </p>
    </main>
  );
}
