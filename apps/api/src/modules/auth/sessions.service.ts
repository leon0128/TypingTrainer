import { createHash, randomBytes } from 'node:crypto';

import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { User } from '@typing-trainer/contracts';

import { SESSION_CLEANUP_INTERVAL_MS, SESSION_TOKEN_BYTES } from './auth.constants';
import { SessionsRepository } from './sessions.repository';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The stored session id: the hex SHA-256 of the token, so a leaked table cannot be replayed. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class SessionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionsService.name);
  private cleanupTimer: NodeJS.Timeout | undefined;

  constructor(@Inject(SessionsRepository) private readonly sessions: SessionsRepository) {}

  /** Creates a session and returns its token, which only the cookie ever holds. */
  async issue(userId: string): Promise<string> {
    const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
    await this.sessions.create(hashSessionToken(token), userId);
    return token;
  }

  /** The signed-in user for a cookie token; malformed tokens never reach the database. */
  async authenticate(token: string | undefined): Promise<User | undefined> {
    if (token === undefined || !TOKEN_PATTERN.test(token)) return undefined;
    return this.sessions.findActiveUser(hashSessionToken(token));
  }

  async revoke(token: string | undefined): Promise<void> {
    if (token === undefined || !TOKEN_PATTERN.test(token)) return;
    await this.sessions.delete(hashSessionToken(token));
  }

  onModuleInit(): void {
    this.cleanupTimer = setInterval(() => {
      this.sessions.deleteExpired().then(
        (count) => {
          if (count > 0) this.logger.log(`deleted ${String(count)} expired sessions`);
        },
        (error: unknown) => {
          this.logger.warn(`session cleanup failed: ${String(error)}`);
        },
      );
    }, SESSION_CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }
}
