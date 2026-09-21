import { Controller, Get, Inject, Req, UnauthorizedException } from '@nestjs/common';
import type { LanguagesResponse } from '@typing-trainer/contracts';
import type { FastifyRequest } from 'fastify';

import { LanguagesService } from './languages.service';

@Controller('languages')
export class LanguagesController {
  constructor(@Inject(LanguagesService) private readonly languages: LanguagesService) {}

  /**
   * The languages the signed-in account may use. Not public since v1.43: what is listed depends on
   * the account's display language (§13.11).
   */
  @Get()
  list(@Req() request: FastifyRequest): Promise<LanguagesResponse> {
    if (request.user === undefined) throw new UnauthorizedException('authentication required');
    return this.languages.list(request.user);
  }
}
