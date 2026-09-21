import type { MouseEventHandler, ReactElement } from 'react';
import { Link } from 'react-router';

import { useTranslation } from '../i18n';

/** The mark with the name, at the top of every screen; it leads back to the home screen. */
export function Logo({ onClick }: { onClick?: MouseEventHandler }): ReactElement {
  const { t } = useTranslation();
  return (
    <Link className="logo self-start" to="/" aria-label={t('app.name')} onClick={onClick}>
      <img className="h-8 w-auto dark:hidden" src="/logo.svg" alt="" />
      <img className="hidden h-8 w-auto dark:block" src="/logo-dark.svg" alt="" />
    </Link>
  );
}
