import { Controller, Get, Inject, Req, UnauthorizedException } from '@nestjs/common';
import type { GhostRecordsResponse } from '@typing-trainer/contracts';
import type { FastifyRequest } from 'fastify';

import { GhostRecordsService } from './ghost-records.service';

@Controller('ghost-records')
export class GhostRecordsController {
  constructor(@Inject(GhostRecordsService) private readonly records: GhostRecordsService) {}

  /** The signed-in user's own best scores per language and period; never other players' (§6.1). */
  @Get()
  get(@Req() request: FastifyRequest): Promise<GhostRecordsResponse> {
    if (request.user === undefined) throw new UnauthorizedException('authentication required');
    return this.records.get(request.user);
  }
}
