import { Controller, Get, Inject, Req, UnauthorizedException } from '@nestjs/common';
import type { RatingsResponse } from '@typing-trainer/contracts';
import type { FastifyRequest } from 'fastify';

import { RatingsService } from './ratings.service';

@Controller('ratings')
export class RatingsController {
  constructor(@Inject(RatingsService) private readonly ratings: RatingsService) {}

  /** The signed-in user's own ratings per language; never other players' (§6.1). */
  @Get()
  get(@Req() request: FastifyRequest): Promise<RatingsResponse> {
    if (request.user === undefined) throw new UnauthorizedException('authentication required');
    return this.ratings.get(request.user);
  }
}
