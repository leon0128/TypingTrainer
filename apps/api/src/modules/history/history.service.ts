import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  HistoryEntry,
  HistoryRequest,
  HistoryResponse,
  User,
} from '@typing-trainer/contracts';

import { accountTracks, assertPoolAvailable, assertTrackAvailable } from '../../common/pool-access';
import { HistoryRepository, type HistoryRow } from './history.repository';

/** The part of the repository the service needs, so tests can substitute it. */
export type HistorySource = Pick<HistoryRepository, 'page' | 'delete'>;

@Injectable()
export class HistoryService {
  constructor(@Inject(HistoryRepository) private readonly history: HistorySource) {}

  async list(user: User, request: HistoryRequest): Promise<HistoryResponse> {
    if (request.language !== undefined) assertPoolAvailable(user, request.language);
    // A named track limits the list to it; otherwise every track the account may use is listed.
    if (request.track !== undefined) assertTrackAvailable(user, request.track);
    const tracks = request.track === undefined ? accountTracks(user) : [request.track];
    const { rows, total } = await this.history.page(user.id, request, tracks);
    return {
      entries: rows.map(toEntry),
      page: request.page,
      pageSize: request.pageSize,
      total,
    };
  }

  /** Deletes one run, only if it belongs to the caller; 404 otherwise, never revealing why. */
  async delete(user: User, id: string): Promise<void> {
    const deleted = await this.history.delete(id, user.id);
    if (!deleted) throw new NotFoundException('run not found');
  }
}

function toEntry(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    startedAt: row.started_at.toISOString(),
    mode: row.mode as HistoryEntry['mode'],
    language: row.slug as HistoryEntry['language'],
    kpm: Number(row.kpm),
    accuracy: Number(row.accuracy),
    score: row.score,
    result: row.result as HistoryEntry['result'],
  };
}
