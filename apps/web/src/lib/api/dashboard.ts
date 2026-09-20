import {
  DashboardResponseSchema,
  type ContentLanguage,
  type DashboardResponse,
  type RankingPeriod,
} from '@typing-trainer/contracts';

import { request } from './client';

/** The signed-in player's own score trend for a period and language (§6.2). */
export function getDashboard(
  params: { period: RankingPeriod; language: ContentLanguage; from?: string; to?: string },
  signal?: AbortSignal,
): Promise<DashboardResponse> {
  const query = new URLSearchParams({ period: params.period, language: params.language });
  if (params.from !== undefined) query.set('from', params.from);
  if (params.to !== undefined) query.set('to', params.to);
  return request(`/dashboard?${query.toString()}`, {
    schema: DashboardResponseSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}
