import { GhostRecordsResponseSchema, type GhostRecordsResponse } from '@typing-trainer/contracts';

import { request } from './client';

/** The signed-in player's own best score per language and period, for the Ghost options (§4.4). */
export function getGhostRecords(signal?: AbortSignal): Promise<GhostRecordsResponse> {
  return request('/ghost-records', {
    schema: GhostRecordsResponseSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}
