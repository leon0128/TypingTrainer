import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@typing-trainer/contracts';

@Controller('health')
export class HealthController {
  /** Liveness: the process is up. Never touches the database, so a slow database cannot restart it. */
  @Get('live')
  live(): HealthResponse {
    return { status: 'ok', checks: [] };
  }
}
