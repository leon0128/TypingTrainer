import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { ENV, type Env } from '../../config/env';
import { AUTH_RATE_LIMITS, createAuthRateLimits } from './auth-rate-limits';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PasswordHasher } from './password-hasher';
import { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';
import { UsersRepository } from './users.repository';

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: PasswordHasher,
      // The dummy hash for unknown users is made before the application accepts requests.
      useFactory: async (env: Env) => {
        const hasher = new PasswordHasher(env.PASSWORD_PEPPER);
        await hasher.prepare();
        return hasher;
      },
      inject: [ENV],
    },
    {
      provide: AUTH_RATE_LIMITS,
      useFactory: (env: Env) => createAuthRateLimits(env),
      inject: [ENV],
    },
    UsersRepository,
    SessionsRepository,
    SessionsService,
    AuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
