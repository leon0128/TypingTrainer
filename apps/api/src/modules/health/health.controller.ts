import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import type { HealthResponse } from '@typing-trainer/contracts';
import type { FastifyReply } from 'fastify';

import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  /** Liveness: the process is up. Never touches the database, so a slow database cannot restart it. */
  @Get('live')
  live(): HealthResponse {
    return { status: 'ok', checks: [] };
  }

  /**
   * Readiness: 200 when every check passes, otherwise 503 with the same body shape. The status is
   * set directly rather than thrown, so the ApiError filter does not replace the report.
   */
  @Get('ready')
  async ready(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthResponse> {
    const report = await this.health.ready();
    if (report.status !== 'ok') {
      void reply.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }
}
