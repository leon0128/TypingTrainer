import type { MatchRating } from '@typing-trainer/contracts';
import type { ReactElement } from 'react';

import { useTranslation } from '../../i18n';
import { languageLabel } from '../tracks/tracks';
import { RankIcon, RankProgress } from './RatingSummary';
import { rankName, rankShift, standingWith } from './standing';
import './rating.css';

/** `+19`, `-4`, or `±0`: the sign is always written, so a change is never read as a level. */
function signed(delta: number): string {
  if (delta > 0) return `+${String(delta)}`;
  if (delta < 0) return `−${String(-delta)}`;
  return '±0';
}

/**
 * What a vs CPU match did to the player's rating (§4.3.5): the language's rating and the overall
 * rating before and after, the rank now held, and a promotion or demotion when it changed.
 */
export function RatingResult({ rating }: { rating: MatchRating }): ReactElement {
  const { t } = useTranslation();
  const language = rating.languages.find((entry) => entry.language === rating.language);
  const name = languageLabel(t, rating.language, language?.displayName ?? rating.language);
  const before = standingWith(rating.languages, rating.language, rating.before);
  const after = standingWith(rating.languages, rating.language, rating.after);
  const shift = rankShift(before.rank, after.rank);
  const languageDelta = rating.after - rating.before;
  const totalDelta = after.total - before.total;

  return (
    <section className="rating-result" aria-labelledby="rating-result-title">
      <h3 id="rating-result-title">{t('rating.resultTitle')}</h3>

      <div className="rating-result-body">
        <RankIcon rank={after.rank} size={88} />
        <div className="rating-result-rows">
          {shift !== 0 && (
            <p className={`rating-shift ${shift > 0 ? 'is-up' : 'is-down'}`} role="status">
              {t(shift > 0 ? 'rating.promoted' : 'rating.demoted', {
                rank: rankName(t, after.rank),
              })}
            </p>
          )}
          <p className="rating-rank">
            {rankName(t, after.rank)}
            {shift !== 0 && (
              <small className="rating-was">
                {t('rating.was', { rank: rankName(t, before.rank) })}
              </small>
            )}
          </p>

          <dl className="rating-changes">
            <dt>{t('rating.languageRating', { language: name })}</dt>
            <dd>
              <span className="rating-from">{rating.before}</span>
              <span aria-hidden="true"> → </span>
              <span className="sr-only">{t('rating.to')}</span>
              <strong>{rating.after}</strong>
              <span className={`rating-delta ${deltaClass(languageDelta)}`}>
                {signed(languageDelta)}
              </span>
            </dd>

            <dt>{t('rating.total')}</dt>
            <dd>
              <span className="rating-from">{before.total}</span>
              <span aria-hidden="true"> → </span>
              <span className="sr-only">{t('rating.to')}</span>
              <strong>{after.total}</strong>
              <span className={`rating-delta ${deltaClass(totalDelta)}`}>{signed(totalDelta)}</span>
            </dd>
          </dl>

          <RankProgress rank={after.rank} total={after.total} />
        </div>
      </div>
    </section>
  );
}

function deltaClass(delta: number): string {
  if (delta > 0) return 'is-up';
  if (delta < 0) return 'is-down';
  return 'is-flat';
}
