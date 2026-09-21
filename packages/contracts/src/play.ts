import { z } from 'zod';

import { ContentLanguageSchema } from './content-bundle';
import { MatchRatingSchema } from './ratings';
import { SessionLogSchema } from './session-log';
import { TypingProgramSchema } from './typing-program';

/** Single play, vs CPU, and Ghost (§4). */
export const PlayModeSchema = z.enum(['single', 'cpu', 'ghost']);

export const CpuLevelSchema = z.int().min(1).max(100);

/** Which of the player's own records a Ghost reproduces (§4.4): the best of today, this week, or ever. */
export const GhostPeriodSchema = z.enum(['daily', 'weekly', 'total']);

/**
 * Body of `POST /api/play/sessions` (§9.5). vs CPU needs a level, Ghost needs a period, and each
 * setting is refused for the modes that do not use it.
 */
export const StartSessionRequestSchema = z
  .object({
    language: ContentLanguageSchema,
    mode: PlayModeSchema.default('single'),
    cpuLevel: CpuLevelSchema.optional(),
    ghostPeriod: GhostPeriodSchema.optional(),
  })
  .superRefine((value, context) => {
    const needsLevel = value.mode === 'cpu';
    const needsPeriod = value.mode === 'ghost';
    if (needsLevel && value.cpuLevel === undefined) {
      context.addIssue({ code: 'custom', path: ['cpuLevel'], message: 'is required for vs CPU' });
    }
    if (!needsLevel && value.cpuLevel !== undefined) {
      context.addIssue({ code: 'custom', path: ['cpuLevel'], message: 'is only for vs CPU' });
    }
    if (needsPeriod && value.ghostPeriod === undefined) {
      context.addIssue({ code: 'custom', path: ['ghostPeriod'], message: 'is required for Ghost' });
    }
    if (!needsPeriod && value.ghostPeriod !== undefined) {
      context.addIssue({ code: 'custom', path: ['ghostPeriod'], message: 'is only for Ghost' });
    }
  });

/**
 * The issued run: the blocks to type, and the seed and content revision that identify them. The
 * server keeps the same values, so a submitted result is replayed against exactly these blocks.
 */
export const StartSessionResponseSchema = z.object({
  sessionId: z.uuid(),
  language: ContentLanguageSchema,
  mode: PlayModeSchema,
  /** The CPU's level for a vs CPU run, null otherwise (§4.3). */
  cpuLevel: CpuLevelSchema.nullable(),
  /**
   * For a Ghost run, the period and the score of the record it reproduces, fixed when the run was
   * issued (§4.4); null otherwise.
   */
  ghostPeriod: GhostPeriodSchema.nullable(),
  ghostScore: z.int().min(1).nullable(),
  /** The 64-bit draw seed in decimal, since JSON numbers cannot hold it exactly. */
  seed: z.string().regex(/^\d+$/),
  contentRevision: z.string().regex(/^[0-9a-f]{64}$/),
  blocks: z.array(TypingProgramSchema).min(1),
  /** The fixed run length and idle limit the client enforces too (§4.1). */
  durationMs: z.int().positive(),
  idleLimitMs: z.int().positive(),
});

export type PlayMode = z.infer<typeof PlayModeSchema>;
export type GhostPeriod = z.infer<typeof GhostPeriodSchema>;
export type StartSessionRequest = z.output<typeof StartSessionRequestSchema>;
export type StartSessionResponse = z.infer<typeof StartSessionResponseSchema>;

/** Body of `POST /api/play/sessions/:id/result`: only the keystroke log, never the client's own
 * numbers. The server replays it against the blocks it issued and discards it (§9.8). */
export const SubmitResultRequestSchema = z.object({
  log: SessionLogSchema,
});

/** A saved run, as stored in `play_sessions` (§9.3). */
export const PlayRunSchema = z.object({
  id: z.uuid(),
  language: ContentLanguageSchema,
  mode: PlayModeSchema,
  /** When the run started, on the server clock: the submission time minus the run time. */
  startedAt: z.iso.datetime(),
  /** The day the run counts towards, in the player's profile time zone (§6.4). */
  localDate: z.iso.date(),
  effectiveKeystrokes: z.int().nonnegative(),
  missCount: z.int().nonnegative(),
  rawKeystrokes: z.int().nonnegative(),
  kpm: z.number().nonnegative(),
  accuracy: z.number().min(0).max(1),
  score: z.int().nonnegative(),
  /** vs CPU and Ghost only: the opponent's score and whether the player won (a tie is a win). */
  cpuLevel: CpuLevelSchema.nullable(),
  ghostPeriod: GhostPeriodSchema.nullable(),
  opponentScore: z.int().nonnegative().nullable(),
  result: z.enum(['win', 'lose']).nullable(),
});

/** Body of a stored result; an empty run answers 204 with no body instead. */
export const SubmitResultResponseSchema = z.object({
  run: PlayRunSchema,
  /** vs CPU only: what the match did to the player's rating (§4.3.5); null for other modes. */
  rating: MatchRatingSchema.nullable(),
});

export type SubmitResultRequest = z.output<typeof SubmitResultRequestSchema>;
export type PlayRun = z.infer<typeof PlayRunSchema>;
export type SubmitResultResponse = z.infer<typeof SubmitResultResponseSchema>;
