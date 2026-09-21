import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  StartSessionRequestSchema,
  SubmitResultRequestSchema,
  type StartSessionRequest,
  type StartSessionResponse,
  type SubmitResultRequest,
  type SubmitResultResponse,
} from '@typing-trainer/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { PlayService } from './play.service';

const SessionIdSchema = z.uuid();

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
    return this.play.start(this.user(request), body);
  }

  /**
   * Submits the result of a run: 201 with the stored run, or 204 when the log holds no keystroke,
   * which is a run that never started and is not saved. Either way the issued run is used up.
   */
  @Post('sessions/:id/result')
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @Param('id', { schema: SessionIdSchema }) sessionId: string,
    @Body({ schema: SubmitResultRequestSchema }) body: SubmitResultRequest,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SubmitResultResponse | undefined> {
    const submitted = await this.play.submitResult(this.user(request), sessionId, body);
    if (submitted === undefined) {
      void reply.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    return submitted;
  }

  // AuthGuard sets the user before any non-public handler runs; checked rather than asserted.
  private user(request: FastifyRequest): NonNullable<FastifyRequest['user']> {
    if (request.user === undefined) throw new UnauthorizedException('authentication required');
    return request.user;
  }
}
