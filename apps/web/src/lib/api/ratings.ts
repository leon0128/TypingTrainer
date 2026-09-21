import { RatingsResponseSchema, type RatingsResponse } from '@typing-trainer/contracts';

import { request } from './client';

/** The signed-in player's own rating in every language (§4.3.5). */
export function getRatings(signal?: AbortSignal): Promise<RatingsResponse> {
  return request('/ratings', {
    schema: RatingsResponseSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}
