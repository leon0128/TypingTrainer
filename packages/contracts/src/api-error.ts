import { z } from 'zod';

/**
 * Body of every error response from the API. For 5xx responses `message` is the generic status
 * text; the underlying cause is logged, never sent.
 */
export const ApiErrorSchema = z.object({
  statusCode: z.number().int().min(400).max(599),
  error: z.string().min(1),
  message: z.string().min(1),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
