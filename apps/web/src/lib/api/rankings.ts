import {
  RankingsResponseSchema,
  type ContentLanguage,
  type RankingPeriod,
  type RankingsResponse,
} from '@typing-trainer/contracts';

import { request } from './client';

/** The signed-in player's own top 10 runs for a period and language (§6.1). */
export function getRankings(
  period: RankingPeriod,
  language: ContentLanguage,
): Promise<RankingsResponse> {
  return request(`/rankings?period=${period}&language=${language}`, {
    schema: RankingsResponseSchema,
  });
}
