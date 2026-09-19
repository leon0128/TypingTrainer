import { randomBytes } from 'node:crypto';

import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { StartSessionRequest, StartSessionResponse, User } from '@typing-trainer/contracts';
import {
  IDLE_LIMIT_MS,
  MAX_SEED,
  PLAY_DURATION_MS,
  RUN_BLOCK_COUNT,
  drawBlockIds,
} from '@typing-trainer/typing-engine';

import { enforce, SlidingWindowLimiter } from '../../common/rate-limit';
import { ContentLibrary } from '../content/content-library';
import { IssuedRunsRepository } from './issued-runs.repository';
import {
  ISSUED_RUN_CLEANUP_INTERVAL_MS,
  ISSUE_LIMIT_PER_USER,
  ISSUE_WINDOW_MS,
} from './play.constants';

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
    const blocks = blockIds.map((blockId) => {
      const program = bundle.programs.get(blockId);
      if (program === undefined) throw new Error(`block ${blockId} is missing from the bundle`);
      return program;
    });

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
