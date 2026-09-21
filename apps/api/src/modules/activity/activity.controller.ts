import { Controller, Get, Inject, Query, Req, UnauthorizedException } from '@nestjs/common';
import {
  ActivityRequestSchema,
  type ActivityRequest,
  type ActivityResponse,
} from '@typing-trainer/contracts';
import type { FastifyRequest } from 'fastify';

import { ActivityService } from './activity.service';

@Controller('activity')
export class ActivityController {
  constructor(@Inject(ActivityService) private readonly activity: ActivityService) {}

  /** The signed-in user's own runs by day, for the play-history grid; never other players' (§6.1). */
  @Get()
  get(
    @Query({ schema: ActivityRequestSchema }) query: ActivityRequest,
    @Req() request: FastifyRequest,
  ): Promise<ActivityResponse> {
    if (request.user === undefined) throw new UnauthorizedException('authentication required');
    return this.activity.get(request.user, query);
  }
}
