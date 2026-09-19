import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  HistoryRequestSchema,
  type HistoryRequest,
  type HistoryResponse,
} from '@typing-trainer/contracts';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { HistoryService } from './history.service';

const HistoryIdSchema = z.uuid();

@Controller('history')
export class HistoryController {
  constructor(@Inject(HistoryService) private readonly history: HistoryService) {}

  @Get()
  list(
    @Query({ schema: HistoryRequestSchema }) query: HistoryRequest,
    @Req() request: FastifyRequest,
  ): Promise<HistoryResponse> {
    return this.history.list(this.user(request), query);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('id', { schema: HistoryIdSchema }) id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.history.delete(this.user(request), id);
  }

  private user(request: FastifyRequest): NonNullable<FastifyRequest['user']> {
    if (request.user === undefined) throw new UnauthorizedException('authentication required');
    return request.user;
  }
}
