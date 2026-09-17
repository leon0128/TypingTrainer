import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { User } from '@typing-trainer/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ENV, type Env } from '../../config/env';
import { IS_PUBLIC } from './public.decorator';
import { sessionCookieClearOptions, sessionCookieName } from './session-cookie';
import { SessionsService } from './sessions.service';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by AuthGuard on routes that require a session. */
    user?: User;
  }
}

/**
 * The global guard: routes require a valid session unless marked @Public(). A missing or invalid
 * session answers 401 and clears a stale cookie.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const name = sessionCookieName(this.env);
    const token = request.cookies[name];
    const user = await this.sessions.authenticate(token);
    if (user === undefined) {
      if (token !== undefined) {
        void http
          .getResponse<FastifyReply>()
          .clearCookie(name, sessionCookieClearOptions(this.env));
      }
      throw new UnauthorizedException('authentication required');
    }
    request.user = user;
    return true;
  }
}
