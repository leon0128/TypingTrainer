import { Body, Controller, Get, Inject, Put, Req, UnauthorizedException } from '@nestjs/common';
import {
  UpdatePreferencesRequestSchema,
  type Preferences,
  type UpdatePreferencesRequest,
} from '@typing-trainer/contracts';
import type { FastifyRequest } from 'fastify';

import { PreferencesService } from './preferences.service';

@Controller('preferences')
export class PreferencesController {
  constructor(@Inject(PreferencesService) private readonly preferences: PreferencesService) {}

  @Get()
  get(@Req() request: FastifyRequest): Preferences {
    return this.preferences.get(this.user(request));
  }

  /** Changes only the settings sent; the time zone is not one of them (§6.4). */
  @Put()
  update(
    @Body({ schema: UpdatePreferencesRequestSchema }) body: UpdatePreferencesRequest,
    @Req() request: FastifyRequest,
  ): Promise<Preferences> {
    return this.preferences.update(this.user(request), body);
  }

  private user(request: FastifyRequest): NonNullable<FastifyRequest['user']> {
    if (request.user === undefined) throw new UnauthorizedException('authentication required');
    return request.user;
  }
}
