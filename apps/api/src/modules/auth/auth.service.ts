import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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

  /**
   * Erases the signed-in user's account and everything of theirs (§7, Q19), after the password is
   * given again. The check is the sign-in check, with the same per-account backoff shared with it: an
   * open session must not be a way to guess the password, and a wrong one is a 403, never a 401,
   * because the client reads a 401 as "your session ended" and would sign the person out.
   */
  async deleteAccount(user: User, password: string): Promise<void> {
    const accountKey = user.username.toLowerCase();
    enforce(this.limits.loginByAccount.check(accountKey));

    const stored = await this.users.findByUsername(user.username);
    // The session was valid a moment ago, so a missing account was deleted a moment ago.
    if (stored === undefined) throw new UnauthorizedException('authentication required');
    if (!(await this.hasher.verify(stored.passwordHash, password))) {
      this.limits.loginByAccount.recordFailure(accountKey);
      throw new ForbiddenException('incorrect password');
    }
    this.limits.loginByAccount.recordSuccess(accountKey);
    if (!(await this.users.deleteById(user.id))) {
      throw new UnauthorizedException('authentication required');
    }
  }

  logout(token: string | undefined): Promise<void> {
    return this.sessions.revoke(token);
  }
}
