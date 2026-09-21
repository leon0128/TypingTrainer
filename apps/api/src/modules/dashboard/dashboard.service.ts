import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  trackOf,
  type ContentLanguage,
  type DashboardPoint,
  type DashboardRequest,
  type DashboardResponse,
  type User,
} from '@typing-trainer/contracts';

import { addDays } from '../../common/local-date';
import { assertPoolAvailable } from '../../common/pool-access';
import { ConquestsRepository } from '../conquests/conquests.repository';
import { LanguagesRepository } from '../languages/languages.repository';
import { DashboardRepository } from './dashboard.repository';

export type DashboardSource = Pick<
  DashboardRepository,
  'today' | 'runs' | 'bestPerDay' | 'totals' | 'bestPerLanguage'
>;
export type HighestLevelSource = Pick<ConquestsRepository, 'highestLevel'>;
export type LanguageIdSource = Pick<LanguagesRepository, 'findEnabled'>;

/** The Sunday that starts the week containing the date (§6.1). */
function weekStart(date: string): string {
  return addDays(date, -new Date(`${date}T00:00:00Z`).getUTCDay());
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DashboardRepository) private readonly dashboard: DashboardSource,
    @Inject(ConquestsRepository) private readonly conquests: HighestLevelSource,
    @Inject(LanguagesRepository) private readonly languages: LanguageIdSource,
  ) {}

  async get(user: User, request: DashboardRequest): Promise<DashboardResponse> {
    const language = (await this.languages.findEnabled()).find(
      (row) => row.slug === request.language,
    );
    if (language === undefined) {
      throw new BadRequestException(`language "${request.language}" is not available`);
    }
    assertPoolAvailable(user, request.language);

    const today = await this.dashboard.today(user.id);
    let from: string | null;
    let to: string | null;
    let points: DashboardPoint[];

    if (request.period === 'daily') {
      from = request.from ?? request.to ?? today;
      to = request.to ?? request.from ?? today;
      const runs = await this.dashboard.runs(user.id, language.id, from, to);
      points = runs.map((run) => ({ x: run.started_at.toISOString(), score: run.score }));
    } else if (request.period === 'weekly') {
      const first = weekStart(request.from ?? today);
      from = first;
      to = addDays(first, 6);
      const best = new Map(
        (await this.dashboard.bestPerDay(user.id, language.id, from, to)).map((row) => [
          row.day,
          row.score,
        ]),
      );
      points = Array.from({ length: 7 }, (_, index) => {
        const day = addDays(first, index);
        return { x: day, score: best.get(day) ?? null };
      });
    } else {
      from = request.from ?? null;
      to = request.to ?? null;
      const best = await this.dashboard.bestPerDay(user.id, language.id, from, to);
      points = best.map((row) => ({ x: row.day, score: row.score }));
    }

    // The summary is that of the track of the language shown: each track stands on its own (§13.9).
    const tracks = [trackOf(request.language)];
    const [totals, bests, highestCpuLevel] = await Promise.all([
      this.dashboard.totals(user.id, tracks),
      this.dashboard.bestPerLanguage(user.id, tracks),
      this.conquests.highestLevel(user.id, tracks),
    ]);
    return {
      period: request.period,
      language: request.language,
      from,
      to,
      points,
      summary: {
        totalRuns: totals.total_runs,
        totalKeystrokes: totals.total_keystrokes,
        bestScores: bests.map((row) => ({
          language: row.slug as ContentLanguage,
          score: row.score,
        })),
        highestCpuLevelBeaten: highestCpuLevel,
      },
    };
  }
}
