import type { LanguageRating, Track } from '@typing-trainer/contracts';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { useTranslation } from '../../i18n';
import { RankIcon, RankProgress } from '../rating/RatingSummary';
import { rankName, standingOf } from '../rating/standing';
import { useRatings } from '../rating/use-ratings';
import { trackPath } from '../tracks/tracks';
import { useAvailableTracks } from '../tracks/use-track';
import { ActivityGrid } from './ActivityGrid';
import { useActivity } from './use-activity';
import './home.css';

/** One track: its name in its colour, and where the player stands in it (§4.3.5, §13.3). */
function TrackCard({
  track,
  ratings,
}: {
  track: Track;
  ratings: readonly LanguageRating[] | null;
}): ReactElement {
  const { t } = useTranslation();
  const standing = ratings === null ? null : standingOf(ratings, track);
  return (
    <Link className="home-card" to={trackPath(track)}>
      <p className="home-card-name">{t(`tracks.${track}`)}</p>
      {standing !== null && (
        <div className="home-card-body">
          <RankIcon rank={standing.rank} size={56} />
          <div className="home-card-numbers">
            <p className="rating-rank">{rankName(t, standing.rank)}</p>
            <p className="rating-total">
              <span className="rating-total-label">{t('rating.total')}</span>
              <span className="rating-total-value">{standing.total}</span>
            </p>
            <RankProgress rank={standing.rank} total={standing.total} />
          </div>
        </div>
      )}
    </Link>
  );
}

/**
 * The screen the logo leads to (§13.9): a card for each track the account may use, and a year of
 * play. The ratings and the play history are read on their own, so a failure of one does not take
 * the rest of the screen with it.
 */
export function HomeScreen(): ReactElement {
  const { t } = useTranslation();
  const tracks = useAvailableTracks();
  const ratings = useRatings();
  const { activity, error } = useActivity();

  return (
    <main className="ui-page mx-auto flex max-w-5xl flex-col gap-8 p-6">
      <section className="flex flex-col gap-3" aria-labelledby="tracks-title">
        <h2 id="tracks-title" className="ui-title text-lg">
          {t('home.tracksHeading')}
        </h2>
        {tracks === null ? (
          <p role="status">{t('common.loading')}</p>
        ) : (
          <ul className="home-cards">
            {tracks.map((track) => (
              <li key={track} data-track={track}>
                <TrackCard track={track} ratings={ratings === null ? null : ratings.languages} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {error !== null && (
        <p
          className="rounded border border-red-500 px-3 py-2 text-red-700 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}
      {activity === null ? (
        error === null && <p role="status">{t('common.loading')}</p>
      ) : (
        <ActivityGrid activity={activity} />
      )}
    </main>
  );
}
