import { z } from 'zod';

import { ContentLanguageSchema } from './content-bundle';
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
