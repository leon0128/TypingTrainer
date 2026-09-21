import type { Track } from '@typing-trainer/contracts';
import type { ReactElement } from 'react';
import { NavLink } from 'react-router';

import { useTranslation } from '../../i18n';
import { trackPath } from './tracks';

const SCREENS = [
  { screen: '', label: 'nav.play' },
  { screen: 'conquests', label: 'nav.conquests' },
  { screen: 'rankings', label: 'nav.rankings' },
  { screen: 'dashboard', label: 'nav.dashboard' },
  { screen: 'history', label: 'nav.history' },
] as const;

/** The screens of a track, under the header (§13.9); the one shown is marked in the track's colour. */
export function TrackNav({ track }: { track: Track }): ReactElement {
  const { t } = useTranslation();
  return (
    <nav className="track-nav" aria-label={t('tracks.label')}>
      <span className="track-name">{t(`tracks.${track}`)}</span>
      {SCREENS.map(({ screen, label }) => (
        <NavLink
          key={label}
          className="track-nav-link"
          to={trackPath(track, screen)}
          end={screen === ''}
        >
          {t(label)}
        </NavLink>
      ))}
    </nav>
  );
}
