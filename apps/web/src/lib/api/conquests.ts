import { ConquestsResponseSchema, type ConquestsResponse } from '@typing-trainer/contracts';

import { request } from './client';

/** The signed-in player's own conquest state for every language (§4.3.4). */
export function getConquests(signal?: AbortSignal): Promise<ConquestsResponse> {
  return request('/cpu-conquests', {
    schema: ConquestsResponseSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}
