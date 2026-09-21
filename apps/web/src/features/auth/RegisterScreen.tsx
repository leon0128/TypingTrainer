import { RegisterRequestSchema, PASSWORD_MIN_LENGTH } from '@typing-trainer/contracts';
import { Link, useNavigate } from 'react-router';

import { useTranslation } from '../../i18n';
import * as authApi from '../../lib/api/auth';
import { translateServerMessage } from '../../lib/api/error-messages';
import { updatePreferences } from '../../lib/api/preferences';
import { useAppearance } from '../appearance/appearance-store';
import { useAuthStore } from './auth-store';
import { CredentialsForm } from './CredentialsForm';
import { LanguageToggle } from './LanguageToggle';
import { Logo } from '../../components/Logo';

/** The browser's own time zone, which the profile uses for day boundaries (§6.4). */
function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function RegisterScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const signedIn = useAuthStore((state) => state.signedIn);

  return (
    <main className="ui-page mx-auto flex max-w-md flex-col gap-6 p-6">
      <Logo />
      <LanguageToggle />
      <h1 className="ui-title text-2xl font-semibold">{t('auth.createTitle')}</h1>
      <CredentialsForm
        submitLabel={t('auth.createSubmit')}
        passwordAutoComplete="new-password"
        hint={t('auth.passwordHint', { min: PASSWORD_MIN_LENGTH })}
        // The same schema the API validates with, so the rules cannot drift apart (§9.4). Its
        // messages are written in English, and are shown in the player's language.
        validate={(username, password) => {
          const parsed = RegisterRequestSchema.safeParse({ username, password });
          if (parsed.success) return null;
          const message = parsed.error.issues[0]?.message;
          return message === undefined
            ? t('auth.checkDetails')
            : (translateServerMessage(message) ?? message);
        }}
        onSubmit={async (username, password) => {
          const user = await authApi.register({
            username,
            password,
            timezone: browserTimezone(),
          });
          // The account starts in the language this screen was in. That is saved before the app
          // learns it is signed in: the moment it does, it loads the account's settings, which
          // would otherwise still say English and put the screen back.
          const locale = useAppearance.getState().locale;
          if (locale !== user.locale) {
            await updatePreferences({ locale }).catch(() => undefined);
          }
          signedIn({ ...user, locale });
          void navigate('/', { replace: true });
        }}
      />
      <p>
        {t('auth.haveAccount')}{' '}
        <Link className="underline" to="/login">
          {t('auth.signIn')}
        </Link>
        .
      </p>
    </main>
  );
}
