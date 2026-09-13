import { z } from 'zod';

/** Upper bound on keys in one run: about four times a human burst of 1,500 KPM over two minutes. */
export const MAX_SESSION_KEYS = 12_000;

/**
 * The keystroke log a client submits with a run result (§9.8). The server replays it against the
 * blocks it issued; the log itself is discarded after validation.
 */
export const SessionLogSchema = z
  .object({
    version: z.literal(1),
    /** Engine keys in order: Enter is "\n", Tab is "\t", any other key is one code point. */
    keys: z.string(),
    /**
     * Milliseconds of run time between consecutive keys (pauses excluded); the first entry is
     * the time from the start of the run to the first key, which is 0 because the countdown
     * starts with it.
     */
    deltas: z.array(z.int().nonnegative()).max(MAX_SESSION_KEYS),
  })
  .superRefine((log, ctx) => {
    const keyCount = Array.from(log.keys).length;
    if (keyCount > MAX_SESSION_KEYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['keys'],
        message: `a run has at most ${String(MAX_SESSION_KEYS)} keys`,
      });
    }
    if (keyCount !== log.deltas.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['deltas'],
        message: `${String(log.deltas.length)} deltas for ${String(keyCount)} keys`,
      });
    }
  });

export type SessionLog = z.infer<typeof SessionLogSchema>;
