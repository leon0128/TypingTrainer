import {
  hash,
  parseOptions,
  verify,
  type Algorithm,
  type Options,
  type Version,
} from '@node-rs/argon2';
import { normalizePassword } from '@typing-trainer/contracts';

import { PASSWORD_PEPPER_MIN_BYTES } from '../../config/env';

// @node-rs/argon2 declares Algorithm and Version as ambient const enums, which isolatedModules
// cannot reference by name; 2 is Algorithm.Argon2id and 1 is Version.V0x13 in its index.d.ts.
const ARGON2ID = 2 as Algorithm;
const VERSION_0X13 = 1 as Version;

/**
 * Argon2id parameters (§7): the OWASP minimum of 19 MiB, 2 passes, 1 lane, and a 32-byte hash.
 * Changing them makes needsRehash() true for older hashes, which are upgraded on sign-in.
 */
export const PASSWORD_HASH_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const satisfies Options;

/**
 * Hashes and verifies passwords with Argon2id, storing PHC strings such as
 * `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`. Passwords are NFKC-normalized first, matching
 * the length rule in contracts; the pepper is passed as Argon2's secret and never stored.
 */
export class PasswordHasher {
  private dummyHash: Promise<string> | undefined;

  constructor(private readonly pepper: Buffer) {
    if (pepper.length < PASSWORD_PEPPER_MIN_BYTES) {
      throw new Error(
        `the password pepper must be at least ${String(PASSWORD_PEPPER_MIN_BYTES)} bytes`,
      );
    }
  }

  /** A PHC string with a fresh random 16-byte salt. */
  hash(password: string): Promise<string> {
    return hash(normalizePassword(password), { ...PASSWORD_HASH_OPTIONS, secret: this.pepper });
  }

  /** True only for the right password under this pepper; a malformed stored hash is false. */
  async verify(stored: string, password: string): Promise<boolean> {
    try {
      return await verify(stored, normalizePassword(password), { secret: this.pepper });
    } catch {
      return false;
    }
  }

  /**
   * Spends the same work as verify() for a username that does not exist, so response times do not
   * reveal which accounts exist. Always false.
   */
  async verifyUnknownUser(password: string): Promise<false> {
    this.dummyHash ??= this.hash('an unused password for timing only');
    await this.verify(await this.dummyHash, password);
    return false;
  }

  /** Whether a stored hash was made with other parameters and should be replaced on sign-in. */
  needsRehash(stored: string): boolean {
    try {
      const options = parseOptions(stored);
      return (
        options.algorithm !== PASSWORD_HASH_OPTIONS.algorithm ||
        options.version !== VERSION_0X13 ||
        options.memoryCost !== PASSWORD_HASH_OPTIONS.memoryCost ||
        options.timeCost !== PASSWORD_HASH_OPTIONS.timeCost ||
        options.parallelism !== PASSWORD_HASH_OPTIONS.parallelism ||
        options.outputLen !== PASSWORD_HASH_OPTIONS.outputLen
      );
    } catch {
      return true;
    }
  }
}
