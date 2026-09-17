import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@typing-trainer/contracts';

import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  /** Liveness: the process is up. Never touches the database, so a slow database cannot restart it. */
  @Get('live')
  live(): HealthResponse {
    return { status: 'ok', checks: [] };
  }

  /** Readiness: 200 when every check passes, otherwise 503 with the same body shape. */
  @Get('ready')
  async ready(): Promise<HealthResponse> {
    const report = await this.health.ready();
    if (report.status !== 'ok') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
