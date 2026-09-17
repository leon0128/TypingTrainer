import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  type AuthResponse,
  type LoginRequest,
  type RegisterRequest,
} from '@typing-trainer/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ENV, type Env } from '../../config/env';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import {
  sessionCookieClearOptions,
  sessionCookieName,
  sessionCookieOptions,
} from './session-cookie';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body({ schema: RegisterRequestSchema }) body: RegisterRequest,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const { user, token } = await this.auth.register(body, request.ip);
    this.setSessionCookie(reply, token);
    return { user };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body({ schema: LoginRequestSchema }) body: LoginRequest,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const { user, token } = await this.auth.login(body, request.ip, this.presentedToken(request));
    this.setSessionCookie(reply, token);
    return { user };
  }

  /** Public, so a client with an expired session can still clear its cookie. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logout(this.presentedToken(request));
    void reply.clearCookie(sessionCookieName(this.env), sessionCookieClearOptions(this.env));
  }

  @Get('me')
  me(@Req() request: FastifyRequest): AuthResponse {
    // AuthGuard sets the user before any non-public handler runs; checked rather than asserted.
    if (request.user === undefined) throw new UnauthorizedException('authentication required');
    return { user: request.user };
  }

  private presentedToken(request: FastifyRequest): string | undefined {
    return request.cookies[sessionCookieName(this.env)];
  }

  private setSessionCookie(reply: FastifyReply, token: string): void {
    void reply.setCookie(sessionCookieName(this.env), token, sessionCookieOptions(this.env));
  }
}
