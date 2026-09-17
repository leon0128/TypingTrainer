import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { HealthCheck, HealthResponse } from '@typing-trainer/contracts';
import type { DataSource } from 'typeorm';

import { ContentConsistency } from '../content/content-consistency';

/** The part of the data source readiness needs, so tests can substitute it. */
export type DatabaseProbe = Pick<DataSource, 'query' | 'showMigrations'>;

/** The part of the content consistency check readiness needs. */
export type ContentProbe = Pick<ContentConsistency, 'findProblems'>;

export const READY_CHECK_TIMEOUT_MS = 1000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @InjectDataSource() private readonly database: DatabaseProbe,
    @Inject(ContentConsistency) private readonly content: ContentProbe,
  ) {}

  /**
   * Readiness: the database answers, no migration is pending, and every enabled language has a
   * content bundle. The endpoint is public, so a failed check reports a fixed detail and the
   * underlying error goes to the log only.
   */
  async ready(timeoutMs = READY_CHECK_TIMEOUT_MS): Promise<HealthResponse> {
    const checks = [
      await this.check('database', 'unreachable', timeoutMs, async () => {
        await this.database.query('SELECT 1');
      }),
      await this.check('migrations', 'pending', timeoutMs, async () => {
        if (await this.database.showMigrations()) {
          throw new Error('there are pending migrations');
        }
      }),
      await this.check('content', 'inconsistent', timeoutMs, async () => {
        const problems = await this.content.findProblems();
        if (problems.length > 0) throw new Error(problems.join('; '));
      }),
    ];
    return { status: checks.every((check) => check.ok) ? 'ok' : 'unavailable', checks };
  }

  private async check(
    name: string,
    failureDetail: string,
    timeoutMs: number,
    probe: () => Promise<void>,
  ): Promise<HealthCheck> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`timed out after ${String(timeoutMs)} ms`));
      }, timeoutMs);
    });
    try {
      await Promise.race([probe(), timeout]);
      return { name, ok: true };
    } catch (error) {
      this.logger.warn(`readiness check ${name} failed: ${String(error)}`);
      return { name, ok: false, detail: failureDetail };
    } finally {
      clearTimeout(timer);
    }
  }
}
