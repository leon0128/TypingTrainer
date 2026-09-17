import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { LoginRequest, RegisterRequest, User } from '@typing-trainer/contracts';

import { enforce } from '../../common/rate-limit';
import { AUTH_RATE_LIMITS, type AuthRateLimits } from './auth-rate-limits';
import { PasswordHasher } from './password-hasher';
import { SessionsService } from './sessions.service';
import { UsersRepository } from './users.repository';

const REGISTRATIONS_KEY = 'all';

export interface SignedIn {
  readonly user: User;
  /** The new session token, for the cookie only. */
  readonly token: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(AUTH_RATE_LIMITS) private readonly limits: AuthRateLimits,
  ) {}

  /**
   * Open sign-up (Q31): limited per client address, and across all clients by accounts actually
   * created. A taken username is a 409; open sign-up cannot hide it, and the address limit bounds
   * how fast names can be probed.
   */
  async register(body: RegisterRequest, address: string): Promise<SignedIn> {
    enforce(this.limits.registerByAddress.hit(address));
    enforce(this.limits.accountsCreated.check(REGISTRATIONS_KEY));
    if ((await this.users.findByUsername(body.username)) !== undefined) {
      throw new ConflictException('username is taken');
    }
    const user = await this.users.create(
      body.username,
      await this.hasher.hash(body.password),
      body.timezone,
    );
    if (user === undefined) {
      throw new ConflictException('username is taken');
    }
    this.limits.accountsCreated.record(REGISTRATIONS_KEY);
    return { user, token: await this.sessions.issue(user.id) };
  }

  /**
   * An unknown username and a wrong password get the same 401 after the same Argon2 work, and the
   * per-account backoff applies to unknown usernames too, so neither the response nor its timing
   * reveals whether an account exists. A presented session is replaced, never reused.
   */
  async login(body: LoginRequest, address: string, presentedToken?: string): Promise<SignedIn> {
    enforce(this.limits.loginByAddress.hit(address));
    const accountKey = body.username.toLowerCase();
    enforce(this.limits.loginByAccount.check(accountKey));

    const user = await this.users.findByUsername(body.username);
    const verified =
      user === undefined
        ? await this.hasher.verifyUnknownUser(body.password)
        : await this.hasher.verify(user.passwordHash, body.password);
    if (user === undefined || !verified) {
      this.limits.loginByAccount.recordFailure(accountKey);
      throw new UnauthorizedException('invalid username or password');
    }

    this.limits.loginByAccount.recordSuccess(accountKey);
    if (this.hasher.needsRehash(user.passwordHash)) {
      await this.users.updatePasswordHash(user.id, await this.hasher.hash(body.password));
    }
    const token = await this.sessions.issue(user.id);
    await this.sessions.revoke(presentedToken);
    // Listed explicitly, so a column added to users is never sent by accident.
    const { id, username, timezone, locale } = user;
    return { user: { id, username, timezone, locale }, token };
  }

  logout(token: string | undefined): Promise<void> {
    return this.sessions.revoke(token);
  }
}
