import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { useTranslation } from '../../i18n';
import { trackPath } from '../tracks/tracks';
import { useAvailableTracks } from '../tracks/use-track';

/** The screen the logo leads to (§13.9): the tracks the account may use. */
export function HomeScreen(): ReactElement {
  const { t } = useTranslation();
  const tracks = useAvailableTracks();
  return (
    <main className="ui-page mx-auto flex max-w-5xl flex-col gap-6 p-6">
      {tracks === null ? (
        <p role="status">{t('common.loading')}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tracks.map((track) => (
            <li key={track} data-track={track}>
              <Link className="ui-tile ui-card block px-3 py-4" to={trackPath(track)}>
                {t(`tracks.${track}`)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
