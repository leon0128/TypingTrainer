import {
  HistoryResponseSchema,
  type HistoryRequest,
  type HistoryResponse,
} from '@typing-trainer/contracts';

import { request } from './client';

/** Query string built from only the filters actually set (§6.3). */
function toQuery(filters: Partial<HistoryRequest>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

export function getHistory(filters: Partial<HistoryRequest>): Promise<HistoryResponse> {
  return request(`/history${toQuery(filters)}`, { schema: HistoryResponseSchema });
}

/** Hard-deletes one run (§6.3): irreversible, so the caller confirms before calling this. */
export function deleteHistoryEntry(id: string): Promise<void> {
  return request(`/history/${id}`, { method: 'DELETE', schema: null });
}
