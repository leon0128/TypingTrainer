import type { LanguageRating } from '@typing-trainer/contracts';
import { RATING_LANGUAGE_MAX, type Rank, type RankStanding } from '@typing-trainer/typing-engine';
import type { ReactElement } from 'react';

import { useTranslation } from '../../i18n';
import { rankIconSrc, rankName, standingOf } from './standing';
import './rating.css';

/** The icon of a rank; decorative, since the rank's name is always written beside it. */
export function RankIcon({ rank, size }: { rank: Rank; size: number }): ReactElement {
  return (
    <img
      className="rank-icon"
      src={rankIconSrc(rank)}
      alt=""
      width={size}
      height={size}
      draggable={false}
    />
  );
}

/** A bar `fraction` full (0 to 1), with its meaning given to assistive technology. */
export function Meter({ fraction, label }: { fraction: number; label: string }): ReactElement {
  const percent = Math.round(Math.min(Math.max(fraction, 0), 1) * 100);
  return (
    <div
      className="rating-meter"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <span style={{ width: `${String(percent)}%` }} />
    </div>
  );
}

/** How far the rank's meter is filled, and what it is waiting for, in words. */
export function RankProgress({ rank, total }: { rank: RankStanding; total: number }): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <Meter fraction={rank.progress} label={t('rating.progress')} />
      <p className="rating-note">
        {rank.next === null || rank.nextMin === null
          ? t('rating.topRank')
          : t('rating.toNext', {
              rank: rankName(t, rank.next),
              points: rank.nextMin - total,
            })}
      </p>
    </>
  );
}

/**
 * The player's standing at a glance (§4.3.5): the rank's icon and name, the overall rating, and
 * how far it is to the next rank.
 */
export function RatingSummary({
  languages,
}: {
  languages: readonly LanguageRating[];
}): ReactElement {
  const { t } = useTranslation();
  const { total, rank } = standingOf(languages);
  return (
    <section className="rating-summary" aria-label={t('rating.title')}>
      <RankIcon rank={rank} size={72} />
      <div className="rating-summary-body">
        <p className="rating-rank">{rankName(t, rank)}</p>
        <p className="rating-total">
          <span className="rating-total-label">{t('rating.total')}</span>
          <span className="rating-total-value">{total}</span>
        </p>
        <RankProgress rank={rank} total={total} />
      </div>
    </section>
  );
}

/**
 * Every language's rating with a bar out of the language maximum; a language not yet raced shows
 * as unplayed.
 */
export function LanguageRatings({
  languages,
}: {
  languages: readonly LanguageRating[];
}): ReactElement {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-2" aria-labelledby="language-ratings-title">
      <h2 id="language-ratings-title" className="text-lg font-medium">
        {t('rating.byLanguage')}
      </h2>
      <ul className="language-ratings">
        {languages.map((entry) => (
          <li key={entry.language}>
            <span className="language-ratings-name">{entry.displayName}</span>
            <Meter
              fraction={entry.rating / RATING_LANGUAGE_MAX}
              label={t('rating.languageMeter', { language: entry.displayName })}
            />
            <span className="language-ratings-value">
              {entry.gamesPlayed === 0 ? t('rating.unplayed') : entry.rating}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
