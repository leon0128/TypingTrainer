import { randomBytes } from 'node:crypto';

import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type {
  PlayRun,
  StartSessionRequest,
  StartSessionResponse,
  SubmitResultRequest,
  TypingProgram,
  User,
} from '@typing-trainer/contracts';
import {
  IDLE_LIMIT_MS,
  MAX_SEED,
  PLAY_DURATION_MS,
  RUN_BLOCK_COUNT,
  drawBlockIds,
  replaySession,
} from '@typing-trainer/typing-engine';

import { SlidingWindowLimiter, enforce } from '../../common/rate-limit';
import { ENV, type Env } from '../../config/env';
import { ContentLibrary } from '../content/content-library';
import { IssuedRunsRepository, type ConsumedRun } from './issued-runs.repository';
import {
  ISSUED_RUN_CLEANUP_INTERVAL_MS,
  ISSUE_LIMIT_PER_USER,
  ISSUE_WINDOW_MS,
} from './play.constants';
import { checkPlausibility } from './play-validation';
import { SUBMISSION_WINDOW_MS } from './plausibility-limits';

/** A 63-bit seed, so it fits the signed bigint column and typing-engine's range. */
function newSeed(): bigint {
  return BigInt(`0x${randomBytes(8).toString('hex')}`) & MAX_SEED;
}

@Injectable()
export class PlayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlayService.name);
  private readonly issues = new SlidingWindowLimiter({
    limit: ISSUE_LIMIT_PER_USER,
    windowMs: ISSUE_WINDOW_MS,
  });
  private cleanupTimer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(IssuedRunsRepository) private readonly issuedRuns: IssuedRunsRepository,
    @Inject(ContentLibrary) private readonly content: ContentLibrary,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Issues a run (§5.3, §9.5): 20 blocks drawn from the language's pool with a fresh seed. The
   * blocks, seed, and content revision are recorded so the submitted result can be replayed
   * against exactly what was issued.
   */
  async start(user: User, request: StartSessionRequest): Promise<StartSessionResponse> {
    enforce(this.issues.hit(user.id));

    const bundle = this.content.get(request.language);
    const languageId = await this.issuedRuns.findEnabledLanguageId(request.language);
    if (bundle === undefined || languageId === undefined) {
      throw new NotFoundException(`language "${request.language}" is not available`);
    }

    const seed = newSeed();
    const blockIds = drawBlockIds(bundle.blockIds, seed, RUN_BLOCK_COUNT);
    const blocks = blockIds.map((blockId) => this.program(request.language, blockId));

    const issued = await this.issuedRuns.create({
      userId: user.id,
      languageId,
      mode: request.mode,
      seed,
      contentRevision: bundle.revision,
      blockIds,
    });

    return {
      sessionId: issued.id,
      language: request.language,
      mode: request.mode,
      seed: seed.toString(),
      contentRevision: bundle.revision,
      blocks,
      durationMs: PLAY_DURATION_MS,
      idleLimitMs: IDLE_LIMIT_MS,
    };
  }

  /**
   * Validates and stores a result (§9.8). The run is consumed first, so one issued run yields at
   * most one submission whatever the outcome. The client's own numbers are never accepted: the log
   * is replayed against the issued blocks and every counter recomputed. The log is discarded here;
   * only the aggregates reach the database (§1.3). An empty log is not a run and is not stored.
   */
  async submitResult(
    user: User,
    sessionId: string,
    body: SubmitResultRequest,
  ): Promise<PlayRun | undefined> {
    const run = await this.consume(user, sessionId);
    const bundle = this.content.get(run.language);
    if (bundle?.revision !== run.contentRevision) {
      throw new ConflictException('the content changed since this run was issued; play again');
    }
    if (body.log.keys.length === 0) return undefined;

    const programs = run.blockIds.map((blockId) => this.program(run.language, blockId));
    const replay = replaySession(programs, body.log);
    const rejection = checkPlausibility(body.log, replay, run.wallElapsedMs);
    if (rejection !== undefined) {
      this.logger.warn(
        `run ${run.id} of user ${user.id} rejected (${rejection.reason}): ${rejection.detail}`,
      );
      throw new UnprocessableEntityException(`result rejected: ${rejection.reason}`);
    }

    const { metrics } = replay;
    const stored = await this.issuedRuns.storeRun({
      userId: user.id,
      languageId: run.languageId,
      mode: run.mode,
      durationSec: PLAY_DURATION_MS / 1000,
      issuedAt: run.issuedAt,
      submittedAt: run.submittedAt,
      runTimeMs: replay.lastKeyMs,
      rawKeystrokes: metrics.raw,
      effectiveKeystrokes: metrics.effective,
      missCount: metrics.miss,
      kpm: metrics.kpm,
      accuracy: metrics.accuracy,
      score: metrics.score,
      rngSeed: run.seed,
      contentRevision: run.contentRevision,
      appVersion: this.env.APP_VERSION,
    });

    return {
      id: stored.id,
      language: run.language,
      mode: 'single',
      startedAt: stored.startedAt.toISOString(),
      localDate: stored.localDate,
      effectiveKeystrokes: metrics.effective,
      missCount: metrics.miss,
      rawKeystrokes: metrics.raw,
      kpm: metrics.kpm,
      accuracy: metrics.accuracy,
      score: metrics.score,
    };
  }

  private async consume(user: User, sessionId: string): Promise<ConsumedRun> {
    const run = await this.issuedRuns.consume(sessionId, user.id, SUBMISSION_WINDOW_MS);
    if (run !== undefined) return run;
    switch (await this.issuedRuns.consumeFailure(sessionId, user.id)) {
      case 'submitted':
        throw new ConflictException('this run was already submitted');
      case 'expired':
        // §9.8: a legitimate run whose submission is delayed this long is rejected too.
        throw new GoneException('this run is too old to submit; play again');
      case 'missing':
        throw new NotFoundException('no such run');
    }
  }

  private program(language: string, blockId: string): TypingProgram {
    const program = this.content.get(language)?.programs.get(blockId);
    if (program === undefined) throw new Error(`block ${blockId} is missing from the bundle`);
    return program;
  }

  onModuleInit(): void {
    this.cleanupTimer = setInterval(() => {
      this.issuedRuns.deleteStale().then(
        (count) => {
          if (count > 0) this.logger.log(`deleted ${String(count)} stale issued runs`);
        },
        (error: unknown) => {
          this.logger.warn(`issued run cleanup failed: ${String(error)}`);
        },
      );
    }, ISSUED_RUN_CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }
}
