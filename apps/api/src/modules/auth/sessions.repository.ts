import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { User } from '@typing-trainer/contracts';
import type { DataSource } from 'typeorm';

import { returnedRows } from '../../database/returned-rows';
import {
  MAX_SESSIONS_PER_USER,
  SESSION_ABSOLUTE_LIFETIME,
  SESSION_IDLE_LIFETIME,
  SESSION_TOUCH_INTERVAL,
} from './auth.constants';

/**
 * Server-side sessions (§7, §9.3). Every validity decision is a condition of the SQL below,
 * evaluated against the database clock; application code never compares session times.
 */
@Injectable()
export class SessionsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Stores a session for the user, then deletes the user's expired sessions and all but the newest
   * MAX_SESSIONS_PER_USER.
   */
  async create(tokenHash: string, userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO auth_sessions (id, user_id, expires_at) VALUES ($1, $2, now() + $3::interval)`,
        [tokenHash, userId, SESSION_ABSOLUTE_LIFETIME],
      );
      await manager.query(
        `DELETE FROM auth_sessions
         WHERE user_id = $1
           AND (expires_at <= now()
             OR last_seen_at <= now() - $2::interval
             OR id NOT IN (SELECT id FROM auth_sessions WHERE user_id = $1
                           ORDER BY created_at DESC, id LIMIT $3))`,
        [userId, SESSION_IDLE_LIFETIME, MAX_SESSIONS_PER_USER],
      );
    });
  }

  /**
   * The user of a valid session, or undefined. Valid means within 30 days of sign-in and 7 days of
   * the last recorded use. The same statement refreshes last_seen_at when it is more than an hour
   * old, so most requests write nothing.
   */
  async findActiveUser(tokenHash: string): Promise<User | undefined> {
    const rows = await this.dataSource.query<User[]>(
      `WITH valid AS (
         SELECT s.id, s.last_seen_at, u.id AS user_id, u.username, u.timezone, u.locale
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = $1
           AND s.expires_at > now()
           AND s.last_seen_at > now() - $2::interval
       ), touched AS (
         UPDATE auth_sessions SET last_seen_at = now()
         WHERE id IN (SELECT id FROM valid WHERE last_seen_at < now() - $3::interval)
         RETURNING id
       )
       SELECT user_id AS id, username::text AS username, timezone, locale FROM valid`,
      [tokenHash, SESSION_IDLE_LIFETIME, SESSION_TOUCH_INTERVAL],
    );
    return rows[0];
  }

  async delete(tokenHash: string): Promise<void> {
    await this.dataSource.query(`DELETE FROM auth_sessions WHERE id = $1`, [tokenHash]);
  }

  /** Deletes every expired or idle session; returns how many were deleted. */
  async deleteExpired(): Promise<number> {
    const result: unknown = await this.dataSource.query(
      `DELETE FROM auth_sessions
       WHERE expires_at <= now() OR last_seen_at <= now() - $1::interval
       RETURNING id`,
      [SESSION_IDLE_LIFETIME],
    );
    return returnedRows<{ id: string }>(result).length;
  }
}
