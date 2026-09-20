import { Controller, Get, Inject, Req, UnauthorizedException } from '@nestjs/common';
import type { ConquestsResponse } from '@typing-trainer/contracts';
import type { FastifyRequest } from 'fastify';

import { ConquestsService } from './conquests.service';

@Controller('cpu-conquests')
export class ConquestsController {
  constructor(@Inject(ConquestsService) private readonly conquests: ConquestsService) {}

  /** The signed-in user's own conquest state per language; never other players' (§6.1). */
  @Get()
  get(@Req() request: FastifyRequest): Promise<ConquestsResponse> {
    if (request.user === undefined) throw new UnauthorizedException('authentication required');
    return this.conquests.get(request.user);
  }
}
