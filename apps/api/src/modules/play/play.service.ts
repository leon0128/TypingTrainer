import { randomBytes } from 'node:crypto';

import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  PlayModeSchema,
  type PlayMode,
  type MatchRating,
  type PlayRun,
  type StartSessionRequest,
  type StartSessionResponse,
  type SubmitResultRequest,
  type TypingProgram,
  type User,
} from '@typing-trainer/contracts';
import {
  IDLE_LIMIT_MS,
  MAX_SEED,
  PLAY_DURATION_MS,
  RUN_BLOCK_COUNT,
  cpuScore,
  cpuTimeline,
  drawBlockIds,
  ghostTimeline,
  judgeMatch,
  replaySession,
} from '@typing-trainer/typing-engine';

import { SlidingWindowLimiter, enforce } from '../../common/rate-limit';
import { ENV, type Env } from '../../config/env';
import { ContentLibrary } from '../content/content-library';
import { GhostRecordsRepository } from '../ghost/ghost-records.repository';
import { RatingsService } from '../ratings/ratings.service';
import { IssuedRunsRepository, type ConsumedRun } from './issued-runs.repository';
import {
  ISSUED_RUN_CLEANUP_INTERVAL_MS,
  ISSUE_LIMIT_PER_USER,
  ISSUE_WINDOW_MS,
} from './play.constants';
import { checkPlausibility } from './play-validation';
import { SUBMISSION_WINDOW_MS } from './plausibility-limits';

/** The mode column as a mode: the database's CHECK allows nothing else. */
function playMode(mode: string): PlayMode {
  return PlayModeSchema.parse(mode);
}

/** A 63-bit seed, so it fits the signed bigint column and typing-engine's range. */
function newSeed(): bigint {
  return BigInt(`0x${randomBytes(8).toString('hex')}`) & MAX_SEED;
}

/** A stored run, and for vs CPU what it did to the player's rating (§4.3.5). */
export interface SubmittedRun {
  readonly run: PlayRun;
  readonly rating: MatchRating | null;
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
    @Inject(GhostRecordsRepository) private readonly records: GhostRecordsRepository,
    @Inject(RatingsService) private readonly ratings: RatingsService,
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

    // A Ghost reproduces the player's best of the period as it stands now, and that score is kept
    // with the run: the client cannot name one, and a later change to the records (a new best, a
    // deleted run) cannot change what this run is judged against (§4.4).
    const ghostScore =
      request.mode === 'ghost' && request.ghostPeriod !== undefined
        ? await this.records.best(user.id, languageId, request.ghostPeriod)
        : null;
    if (request.mode === 'ghost' && (ghostScore === null || ghostScore < 1)) {
      throw new ConflictException(
        `there is no record for ${request.ghostPeriod ?? 'that period'} to race`,
      );
    }

    const seed = newSeed();
    const blockIds = drawBlockIds(bundle.blockIds, seed, RUN_BLOCK_COUNT);
    const blocks = blockIds.map((blockId) => this.program(request.language, blockId));

    const issued = await this.issuedRuns.create({
      userId: user.id,
      languageId,
      mode: request.mode,
      cpuLevel: request.cpuLevel ?? null,
      ghostPeriod: request.ghostPeriod ?? null,
      ghostScore,
      seed,
      contentRevision: bundle.revision,
      blockIds,
    });

    return {
      sessionId: issued.id,
      language: request.language,
      mode: request.mode,
      cpuLevel: request.cpuLevel ?? null,
      ghostPeriod: request.ghostPeriod ?? null,
      ghostScore,
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
  ): Promise<SubmittedRun | undefined> {
    const run = await this.consume(user, sessionId);
    const bundle = this.content.get(run.language);
    if (bundle?.revision !== run.contentRevision) {
      // Not the player's doing, so the loss charged when the run was issued is taken back.
      await this.settleRating(user, run, 'void');
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
    // The opponent is recomputed here from what was issued — the seed and level for the CPU, the
    // record's score for the Ghost; nothing the client says about the match is used (§9.8).
    let opponent: number | null = null;
    if (run.mode === 'cpu' && run.cpuLevel !== null) {
      opponent = cpuScore(cpuTimeline(programs, run.cpuLevel, BigInt(run.seed)));
    } else if (run.mode === 'ghost' && run.ghostScore !== null) {
      opponent = cpuScore(ghostTimeline(programs, run.ghostScore));
    }
    const result = opponent === null ? null : judgeMatch(metrics.score, opponent);
    const rating = result === null ? null : await this.settleRating(user, run, result);
    const stored = await this.issuedRuns.storeRun({
      userId: user.id,
      languageId: run.languageId,
      mode: run.mode,
      cpuLevel: run.cpuLevel,
      ghostPeriod: run.ghostPeriod,
      opponentScore: opponent,
      result,
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

    if (stored === undefined) throw new UnauthorizedException('authentication required');

    const storedRun: PlayRun = {
      id: stored.id,
      language: run.language,
      mode: playMode(run.mode),
      startedAt: stored.startedAt.toISOString(),
      localDate: stored.localDate,
      effectiveKeystrokes: metrics.effective,
      missCount: metrics.miss,
      rawKeystrokes: metrics.raw,
      kpm: metrics.kpm,
      accuracy: metrics.accuracy,
      score: metrics.score,
      cpuLevel: run.cpuLevel,
      ghostPeriod: run.ghostPeriod,
      opponentScore: opponent,
      result,
    };
    return { run: storedRun, rating };
  }

  /**
   * Replaces the loss charged when a vs CPU run was issued with how it really ended (§4.3.5), and
   * reports the language's rating before and after with every language's rating as it now stands.
   * Null for a run that is not rated: any other mode, or one issued before ratings existed.
   */
  private async settleRating(
    user: User,
    run: ConsumedRun,
    outcome: 'win' | 'lose' | 'void',
  ): Promise<MatchRating | null> {
    if (run.mode !== 'cpu' || run.cpuLevel === null || run.rating === null) return null;
    const settled = await this.issuedRuns.settleRating(
      {
        userId: user.id,
        languageId: run.languageId,
        cpuLevel: run.cpuLevel,
        rating: run.rating,
      },
      outcome,
    );
    const { languages } = await this.ratings.get(user);
    return { language: run.language, before: settled.before, after: settled.after, languages };
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
