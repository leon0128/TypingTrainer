import type { MouseEvent, ReactElement } from 'react';
import { Link, useLocation } from 'react-router';

import { useTranslation } from '../../i18n';
import { useLeaveGuard } from '../nav/leave-guard';
import { useRunSession } from '../play/run-session';
import { trackOf } from '@typing-trainer/contracts';
import { trackOfSegment, trackPath } from './tracks';
import { useAvailableTracks } from './use-track';

/**
 * The tracks the account may use, side by side in the header, with the current one marked (§13.9).
 * The current one is the track in the URL, or on the play screen the track of the run in progress.
 * Switching away from a run asks first, as the rest of the header does.
 */
export function TrackSwitch(): ReactElement | null {
  const { t } = useTranslation();
  const tracks = useAvailableTracks();
  const { pathname } = useLocation();
  const guard = useLeaveGuard((state) => state.message);
  const playing = useRunSession((state) => state.run?.issued.language);

  if (tracks === null || tracks.length === 0) return null;
  const current =
    pathname === '/play' && playing !== undefined
      ? trackOf(playing)
      : trackOfSegment(pathname.split('/')[1]);

  const confirmLeave = (event: MouseEvent): void => {
    if (guard !== null && !window.confirm(guard)) event.preventDefault();
  };

  return (
    <div className="track-switch" role="group" aria-label={t('tracks.label')}>
      {tracks.map((track) => (
        <Link
          key={track}
          className="track-switch-item"
          data-track={track}
          to={trackPath(track)}
          aria-current={track === current ? 'page' : undefined}
          onClick={confirmLeave}
        >
          {t(`tracks.${track}`)}
        </Link>
      ))}
    </div>
  );
}
