import type { MouseEvent, ReactElement } from 'react';
import { NavLink } from 'react-router';

import { useTranslation } from '../i18n';
import { useAuthStore } from '../features/auth/auth-store';
import { useLeaveGuard } from '../features/nav/leave-guard';
import { Icon } from './Icon';
import { Logo } from './Logo';

const LINKS = [
  { to: '/', icon: 'home', label: 'common.chooseLanguage' },
  { to: '/conquests', icon: 'military_tech', label: 'nav.conquests' },
  { to: '/rankings', icon: 'leaderboard', label: 'nav.rankings' },
  { to: '/dashboard', icon: 'insights', label: 'nav.dashboard' },
  { to: '/history', icon: 'history', label: 'nav.history' },
  { to: '/settings', icon: 'palette', label: 'nav.appearance' },
] as const;

/**
 * The header of every signed-in screen: the logo (home), the places to go, and — set apart from
 * them — who is playing and the way to sign out.
 */
export function AppHeader(): ReactElement {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const guard = useLeaveGuard((state) => state.message);

  /** Asks first when the screen has something to lose, and stays put on "cancel". */
  const confirmLeave = (event: MouseEvent): void => {
    if (guard !== null && !window.confirm(guard)) event.preventDefault();
  };

  return (
    <header className="app-header">
      <Logo onClick={confirmLeave} />
      <nav className="app-nav" aria-label={t('nav.label')}>
        {LINKS.map(({ to, icon, label }) => (
          <NavLink key={to} className="ui-chip" to={to} end={to === '/'} onClick={confirmLeave}>
            <Icon name={icon} className="ui-icon" />
            {t(label)}
          </NavLink>
        ))}
      </nav>
      {user !== null && (
        <div className="ui-userbox">
          <NavLink
            className="ui-username"
            to="/account"
            title={t('nav.account')}
            onClick={confirmLeave}
          >
            <Icon name="person" className="ui-icon" />
            {user.displayName ?? user.username}
          </NavLink>
          <button
            className="ui-logout"
            type="button"
            aria-label={t('common.signOut')}
            title={t('common.signOut')}
            onClick={(event) => {
              confirmLeave(event);
              if (!event.defaultPrevented) void signOut();
            }}
          >
            <Icon name="logout" className="ui-icon" />
          </button>
        </div>
      )}
    </header>
  );
}
