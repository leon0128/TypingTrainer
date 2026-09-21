import { ActivityResponseSchema, type ActivityResponse } from '@typing-trainer/contracts';

import { request } from './client';

/** The signed-in player's own runs by day over the last year, for the play-history grid (§13.9). */
export function getActivity(signal?: AbortSignal): Promise<ActivityResponse> {
  return request('/activity', {
    schema: ActivityResponseSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}
