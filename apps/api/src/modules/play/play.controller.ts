import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  StartSessionRequestSchema,
  type StartSessionRequest,
  type StartSessionResponse,
} from '@typing-trainer/contracts';
import type { FastifyRequest } from 'fastify';

import { PlayService } from './play.service';

@Controller('play')
export class PlayController {
  constructor(@Inject(PlayService) private readonly play: PlayService) {}

  /** Starts a run and returns its blocks; requires a session, like every route by default (§7). */
  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  start(
    @Body({ schema: StartSessionRequestSchema }) body: StartSessionRequest,
    @Req() request: FastifyRequest,
  ): Promise<StartSessionResponse> {
    // AuthGuard sets the user before any non-public handler runs; checked rather than asserted.
    if (request.user === undefined) throw new UnauthorizedException('authentication required');
    return this.play.start(request.user, body);
  }
}
