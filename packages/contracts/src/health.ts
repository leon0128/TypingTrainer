import { z } from 'zod';

export const HealthCheckSchema = z.object({
  name: z.string().min(1),
  ok: z.boolean(),
  detail: z.string().optional(),
});

/** Body of `GET /api/health/live` and `GET /api/health/ready` (§9.6). */
export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  checks: z.array(HealthCheckSchema),
});

export type HealthCheck = z.infer<typeof HealthCheckSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
