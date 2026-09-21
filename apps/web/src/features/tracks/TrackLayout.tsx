import type { ReactElement } from 'react';
import { Navigate, Outlet, useParams } from 'react-router';

import { useTranslation } from '../../i18n';
import { TrackNav } from './TrackNav';
import { trackOfSegment } from './tracks';
import { TrackContext, useAvailableTracks } from './use-track';
import './tracks.css';

/**
 * What every screen of a track sits in (§13.9): the track from the URL, its colour, and the menu of
 * its screens. A track that does not exist, or that the account may not use, goes back to the home
 * screen. The screen below is remounted when the track changes, so nothing chosen in one track (a
 * language, a filter) is carried into another.
 */
export function TrackLayout(): ReactElement {
  const { t } = useTranslation();
  const { track: segment } = useParams();
  const track = trackOfSegment(segment);
  const available = useAvailableTracks();

  if (track === null) return <Navigate to="/" replace />;
  if (available === null) return <p role="status">{t('common.loading')}</p>;
  if (!available.includes(track)) return <Navigate to="/" replace />;

  return (
    <TrackContext.Provider value={track}>
      <div className="track-layout" data-track={track}>
        <TrackNav track={track} />
        <div key={track}>
          <Outlet />
        </div>
      </div>
    </TrackContext.Provider>
  );
}
