import { Controller, Get, Inject, Query, Req, UnauthorizedException } from '@nestjs/common';
import {
  RankingsRequestSchema,
  type RankingsRequest,
  type RankingsResponse,
} from '@typing-trainer/contracts';
import type { FastifyRequest } from 'fastify';

import { RankingsService } from './rankings.service';

@Controller('rankings')
export class RankingsController {
  constructor(@Inject(RankingsService) private readonly rankings: RankingsService) {}

  /** The signed-in user's own top 10 runs for a period and language; never other players' (§6.1). */
  @Get()
  get(
    @Query({ schema: RankingsRequestSchema }) query: RankingsRequest,
    @Req() request: FastifyRequest,
  ): Promise<RankingsResponse> {
    if (request.user === undefined) throw new UnauthorizedException('authentication required');
    return this.rankings.get(request.user, query);
  }
}
