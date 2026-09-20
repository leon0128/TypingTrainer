import { Controller, Get, Inject, Query, Req, UnauthorizedException } from '@nestjs/common';
import {
  DashboardRequestSchema,
  type DashboardRequest,
  type DashboardResponse,
} from '@typing-trainer/contracts';
import type { FastifyRequest } from 'fastify';

import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  /** The signed-in user's own score trend for a period and language (§6.2). */
  @Get()
  get(
    @Query({ schema: DashboardRequestSchema }) query: DashboardRequest,
    @Req() request: FastifyRequest,
  ): Promise<DashboardResponse> {
    if (request.user === undefined) throw new UnauthorizedException('authentication required');
    return this.dashboard.get(request.user, query);
  }
}
