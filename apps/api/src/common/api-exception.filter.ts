import { STATUS_CODES } from 'node:http';

import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiError } from '@typing-trainer/contracts';
import type { FastifyReply } from 'fastify';

/**
 * Turns every exception into an ApiError body. Client errors keep their message; server errors
 * send only the status text and log the cause, so stack traces and connection details never
 * reach a response.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const error = STATUS_CODES[status] ?? 'Error';
    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
    }
    const body: ApiError = {
      statusCode: status,
      error,
      message: status < 500 && exception instanceof HttpException ? exception.message : error,
    };
    void host.switchToHttp().getResponse<FastifyReply>().status(status).send(body);
  }
}
