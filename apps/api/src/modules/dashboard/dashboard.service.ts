import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type {
  ContentLanguage,
  DashboardPoint,
  DashboardRequest,
  DashboardResponse,
  User,
} from '@typing-trainer/contracts';

import { LanguagesRepository } from '../languages/languages.repository';
import { DashboardRepository } from './dashboard.repository';

export type DashboardSource = Pick<
  DashboardRepository,
  'today' | 'runs' | 'bestPerDay' | 'totals' | 'bestPerLanguage'
>;
export type LanguageIdSource = Pick<LanguagesRepository, 'findEnabled'>;

/** Adds days to a `YYYY-MM-DD` date; calendar arithmetic only, no time zone involved. */
function addDays(date: string, delta: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + delta);
  return moved.toISOString().slice(0, 10);
}

/** The Sunday that starts the week containing the date (§6.1). */
function weekStart(date: string): string {
  return addDays(date, -new Date(`${date}T00:00:00Z`).getUTCDay());
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DashboardRepository) private readonly dashboard: DashboardSource,
    @Inject(LanguagesRepository) private readonly languages: LanguageIdSource,
  ) {}

  async get(user: User, request: DashboardRequest): Promise<DashboardResponse> {
    const language = (await this.languages.findEnabled()).find(
      (row) => row.slug === request.language,
    );
    if (language === undefined) {
      throw new BadRequestException(`language "${request.language}" is not available`);
    }

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

    const [totals, bests] = await Promise.all([
      this.dashboard.totals(user.id),
      this.dashboard.bestPerLanguage(user.id),
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
        highestCpuLevelBeaten: null,
      },
    };
  }
}
