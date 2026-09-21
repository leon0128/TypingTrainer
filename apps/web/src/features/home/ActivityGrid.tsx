import type { ActivityResponse } from '@typing-trainer/contracts';
import type { ReactElement } from 'react';

import { i18n, useTranslation } from '../../i18n';
import { buildGrid, cellClassName, levelOf } from './activity-grid';
import './home.css';

/** A Sunday, so its weekday names can be read off its own dates. */
const SUNDAY = Date.UTC(2023, 0, 1);

/**
 * The play-history grid (§13.9): a year of days, a cell for each. A cell is coloured when a run was
 * played that day: green for code, violet for natural language, in four shades by the number of
 * runs, and both colours when a day had both. The colours are decoration: every cell says its day and
 * counts in its title, the totals are written above, and the days are listed below for a reader who
 * has no use for the picture.
 */
export function ActivityGrid({ activity }: { activity: ActivityResponse }): ReactElement {
  const { t } = useTranslation();
  const grid = buildGrid(activity);
  const month = new Intl.DateTimeFormat(i18n.language, { month: 'short', timeZone: 'UTC' });
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', timeZone: 'UTC' });
  const labelOf = (row: number) => weekday.format(new Date(SUNDAY + row * 86_400_000));
  const monthAt = new Map(grid.months.map((entry) => [entry.column, entry.month]));

  return (
    <section className="activity" aria-labelledby="activity-title">
      <div className="activity-head">
        <h2 id="activity-title" className="text-lg font-medium">
          {t('home.activityHeading')}
        </h2>
        <p className="activity-totals">
          {t('home.activityTotals', { runs: grid.runs, days: grid.days })}
        </p>
      </div>

      <div className="activity-scroll">
        <div className="activity-frame">
          <div className="activity-weekdays" aria-hidden="true">
            {[1, 3, 5].map((row) => (
              <span key={row} style={{ gridRow: row + 1 }}>
                {labelOf(row)}
              </span>
            ))}
          </div>
          <div className="activity-body">
            <div
              className="activity-months"
              aria-hidden="true"
              style={{ gridTemplateColumns: `repeat(${String(grid.weeks.length)}, var(--cell))` }}
            >
              {grid.weeks.map((_, column) => {
                const at = monthAt.get(column);
                return (
                  <span key={column} style={{ gridColumn: column + 1 }}>
                    {at === undefined ? '' : month.format(new Date(Date.UTC(2023, at, 1)))}
                  </span>
                );
              })}
            </div>
            <div
              className="activity-grid"
              aria-hidden="true"
              style={{ gridTemplateColumns: `repeat(${String(grid.weeks.length)}, var(--cell))` }}
            >
              {grid.weeks.flatMap((week) =>
                week.map((cell) => {
                  if (!cell.inRange)
                    return <span key={cell.date} className="activity-cell is-blank" />;
                  return (
                    <span
                      key={cell.date}
                      className={cellClassName(cell)}
                      data-code={levelOf(cell.code)}
                      data-natural={levelOf(cell.natural)}
                      title={t('home.activityDay', {
                        date: cell.date,
                        code: cell.code,
                        natural: cell.natural,
                      })}
                    />
                  );
                }),
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="activity-legend" aria-hidden="true">
        <span className="activity-legend-item">
          {t('home.legendCode')}
          <span className="activity-swatches has-code">
            {[1, 2, 3, 4].map((level) => (
              <span
                key={level}
                className="activity-cell has-code"
                data-code={level}
                data-natural={0}
              />
            ))}
          </span>
        </span>
        <span className="activity-legend-item">
          {t('home.legendNatural')}
          <span className="activity-swatches">
            {[1, 2, 3, 4].map((level) => (
              <span
                key={level}
                className="activity-cell has-natural"
                data-code={0}
                data-natural={level}
              />
            ))}
          </span>
        </span>
        <span className="activity-legend-item">
          <span className="activity-cell has-code has-natural" data-code={3} data-natural={3} />
          {t('home.legendBoth')}
        </span>
      </div>

      <details className="activity-list">
        <summary>{t('home.activityList')}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{t('home.listDate')}</th>
              <th scope="col">{t('home.legendCode')}</th>
              <th scope="col">{t('home.legendNatural')}</th>
            </tr>
          </thead>
          <tbody>
            {activity.days.map((day) => (
              <tr key={day.date}>
                <th scope="row">{day.date}</th>
                <td>{day.code}</td>
                <td>{day.natural}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
