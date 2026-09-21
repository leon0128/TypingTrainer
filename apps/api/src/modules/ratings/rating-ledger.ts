import { RATING_LANGUAGE_MAX, ratingDelta } from '@typing-trainer/typing-engine';

import { returnedRows } from '../../database/returned-rows';

/** Anything that can run a statement: a data source, or the manager of a transaction. */
export interface Queryable {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

/** What issuing a vs CPU run recorded against the language's rating (§4.3.5). */
export interface RatingCharge {
  readonly ratingBefore: number;
  readonly gamesBefore: number;
  /** The points taken when the run was issued: the loss it is counted as until it is submitted. */
  readonly ratingCharged: number;
}

/** The parts of an issued run that settling its rating needs. */
export interface ChargedRun extends RatingCharge {
  readonly userId: string;
  readonly languageId: number;
  readonly cpuLevel: number;
}

/**
 * Counts a vs CPU run as a loss the moment it is issued (§4.3.5): leaving it unfinished, or
 * submitting nothing, is then a loss with no further step. Call inside the transaction that
 * records the issued run. The row is locked so runs issued together are charged one after another.
 */
export async function chargeLoss(
  db: Queryable,
  userId: string,
  languageId: number,
  cpuLevel: number,
): Promise<RatingCharge> {
  await db.query(
    `INSERT INTO language_ratings (user_id, language_id) VALUES ($1, $2)
     ON CONFLICT (user_id, language_id) DO NOTHING`,
    [userId, languageId],
  );
  const rows = returnedRows<{ rating: number; games_played: number }>(
    await db.query(
      `SELECT rating, games_played FROM language_ratings
       WHERE user_id = $1 AND language_id = $2 FOR UPDATE`,
      [userId, languageId],
    ),
  );
  const row = rows[0];
  if (row === undefined) throw new Error('the rating row was just created');
  const ratingCharged = ratingDelta({
    rating: row.rating,
    gamesPlayed: row.games_played,
    cpuLevel,
    won: false,
  });
  await db.query(
    `UPDATE language_ratings SET rating = rating + $3, games_played = games_played + 1
     WHERE user_id = $1 AND language_id = $2`,
    [userId, languageId, ratingCharged],
  );
  return { ratingBefore: row.rating, gamesBefore: row.games_played, ratingCharged };
}

/** How a charged run ended: won or lost as judged, or not counted at all. */
export type RatingOutcome = 'win' | 'lose' | 'void';

export interface SettledRating {
  readonly before: number;
  readonly after: number;
}

/**
 * Replaces the loss charged at issue with the real outcome (§4.3.5). The match's own points are
 * worked out from the rating and match count it started with, so what it is worth does not depend
 * on other runs finishing in between; only the difference from the charge is applied, in one
 * statement, so the rating stays right if they overlap. A void run — one the server could not
 * judge through no fault of the player — gives its points and its match back.
 */
export async function settleRating(
  db: Queryable,
  run: ChargedRun,
  outcome: RatingOutcome,
): Promise<SettledRating> {
  const delta =
    outcome === 'void'
      ? 0
      : ratingDelta({
          rating: run.ratingBefore,
          gamesPlayed: run.gamesBefore,
          cpuLevel: run.cpuLevel,
          won: outcome === 'win',
        });
  await db.query(
    `UPDATE language_ratings
     SET rating = LEAST($5::int, GREATEST(0, rating + $3::int - $4::int)),
         games_played = games_played - $6::int
     WHERE user_id = $1 AND language_id = $2`,
    [
      run.userId,
      run.languageId,
      delta,
      run.ratingCharged,
      RATING_LANGUAGE_MAX,
      outcome === 'void' ? 1 : 0,
    ],
  );
  return { before: run.ratingBefore, after: run.ratingBefore + delta };
}
