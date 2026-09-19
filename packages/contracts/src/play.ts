import { z } from 'zod';

import { ContentLanguageSchema } from './content-bundle';
import { SessionLogSchema } from './session-log';
import { TypingProgramSchema } from './typing-program';

/** P1 plays solo; vs CPU arrives in P2 and Ghost in P3 (§10). */
export const PlayModeSchema = z.literal('single');

/** Body of `POST /api/play/sessions` (§9.5). */
export const StartSessionRequestSchema = z.object({
  language: ContentLanguageSchema,
  mode: PlayModeSchema.default('single'),
});

/**
 * The issued run: the blocks to type, and the seed and content revision that identify them. The
 * server keeps the same values, so a submitted result is replayed against exactly these blocks.
 */
export const StartSessionResponseSchema = z.object({
  sessionId: z.uuid(),
  language: ContentLanguageSchema,
  mode: PlayModeSchema,
  /** The 64-bit draw seed in decimal, since JSON numbers cannot hold it exactly. */
  seed: z.string().regex(/^\d+$/),
  contentRevision: z.string().regex(/^[0-9a-f]{64}$/),
  blocks: z.array(TypingProgramSchema).min(1),
  /** The fixed run length and idle limit the client enforces too (§4.1). */
  durationMs: z.int().positive(),
  idleLimitMs: z.int().positive(),
});

export type PlayMode = z.infer<typeof PlayModeSchema>;
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
});

/** Body of a stored result; an empty run answers 204 with no body instead. */
export const SubmitResultResponseSchema = z.object({
  run: PlayRunSchema,
});

export type SubmitResultRequest = z.output<typeof SubmitResultRequestSchema>;
export type PlayRun = z.infer<typeof PlayRunSchema>;
export type SubmitResultResponse = z.infer<typeof SubmitResultResponseSchema>;
