import { argon2Sync } from 'node:crypto';

import { hash, hashRawSync, hashSync, type Algorithm } from '@node-rs/argon2';
import { describe, expect, it, vi } from 'vitest';

import { PASSWORD_HASH_OPTIONS, PasswordHasher } from '../src/modules/auth/password-hasher';

const ARGON2ID = 2 as Algorithm;
const PEPPER = Buffer.alloc(32, 0x5a);
const PASSWORD = 'correct horse battery staple';

/**
 * Argon2id version 0x13 vectors from the reference implementation, copied from the hashtest()
 * calls under "Test Argon2id version number" in P-H-C/phc-winner-argon2 src/test.c:
 * [passes, log2(memory KiB), lanes, password, salt, raw hash, PHC string].
 */
const REFERENCE_VECTORS: readonly [number, number, number, string, string, string, string][] = [
  [
    2,
    16,
    1,
    'password',
    'somesalt',
    '09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7',
    '$argon2id$v=19$m=65536,t=2,p=1$c29tZXNhbHQ$CTFhFdXPJO1aFaMaO6Mm5c8y7cJHAph8ArZWb2GRPPc',
  ],
  [
    2,
    18,
    1,
    'password',
    'somesalt',
    '78fe1ec91fb3aa5657d72e710854e4c3d9b9198c742f9616c2f085bed95b2e8c',
    '$argon2id$v=19$m=262144,t=2,p=1$c29tZXNhbHQ$eP4eyR+zqlZX1y5xCFTkw9m5GYx0L5YWwvCFvtlbLow',
  ],
  [
    2,
    8,
    1,
    'password',
    'somesalt',
    '9dfeb910e80bad0311fee20f9c0e2b12c17987b4cac90c2ef54d5b3021c68bfe',
    '$argon2id$v=19$m=256,t=2,p=1$c29tZXNhbHQ$nf65EOgLrQMR/uIPnA4rEsF5h7TKyQwu9U1bMCHGi/4',
  ],
  [
    2,
    8,
    2,
    'password',
    'somesalt',
    '6d093c501fd5999645e0ea3bf620d7b8be7fd2db59c20d9fff9539da2bf57037',
    '$argon2id$v=19$m=256,t=2,p=2$c29tZXNhbHQ$bQk8UB/VmZZF4Oo79iDXuL5/0ttZwg2f/5U52iv1cDc',
  ],
  [
    1,
    16,
    1,
    'password',
    'somesalt',
    'f6a5adc1ba723dddef9b5ac1d464e180fcd9dffc9d1cbf76cca2fed795d9ca98',
    '$argon2id$v=19$m=65536,t=1,p=1$c29tZXNhbHQ$9qWtwbpyPd3vm1rB1GThgPzZ3/ydHL92zKL+15XZypg',
  ],
  [
    4,
    16,
    1,
    'password',
    'somesalt',
    '9025d48e68ef7395cca9079da4c4ec3affb3c8911fe4f86d1a2520856f63172c',
    '$argon2id$v=19$m=65536,t=4,p=1$c29tZXNhbHQ$kCXUjmjvc5XMqQedpMTsOv+zyJEf5PhtGiUghW9jFyw',
  ],
  [
    2,
    16,
    1,
    'differentpassword',
    'somesalt',
    '0b84d652cf6b0c4beaef0dfe278ba6a80df6696281d7e0d2891b817d8c458fde',
    '$argon2id$v=19$m=65536,t=2,p=1$c29tZXNhbHQ$C4TWUs9rDEvq7w3+J4umqA32aWKB1+DSiRuBfYxFj94',
  ],
  [
    2,
    16,
    1,
    'password',
    'diffsalt',
    'bdf32b05ccc42eb15d58fd19b1f856b113da1e9a5874fdcc544308565aa8141c',
    '$argon2id$v=19$m=65536,t=2,p=1$ZGlmZnNhbHQ$vfMrBczELrFdWP0ZsfhWsRPaHppYdP3MVEMIVlqoFBw',
  ],
];

/** RFC 9106 §5.3, the Argon2id test vector, copied from the RFC text. */
const RFC_9106_ARGON2ID = {
  password: Buffer.alloc(32, 0x01),
  salt: Buffer.alloc(16, 0x02),
  secret: Buffer.alloc(8, 0x03),
  associatedData: Buffer.alloc(12, 0x04),
  memory: 32,
  passes: 3,
  parallelism: 4,
  tag: '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659',
};

/** Splits `$argon2id$v=19$m=..,t=..,p=..$<salt>$<hash>` into its base64 fields. */
function phcFields(phc: string): { params: string; salt: Buffer; hash: Buffer } {
  const [, algorithm, version, params, salt, digest] = phc.split('$');
  expect([algorithm, version]).toEqual(['argon2id', 'v=19']);
  return {
    params: params ?? '',
    salt: Buffer.from(salt ?? '', 'base64'),
    hash: Buffer.from(digest ?? '', 'base64'),
  };
}

describe('Argon2id implementations against published vectors', () => {
  // @node-rs/argon2 has no associated-data input, so RFC 9106 §5.3 cannot be run through it.
  // It is checked against the reference implementation's vectors instead, and its secret (pepper)
  // path against node:crypto, which is itself checked against RFC 9106 below.
  it.each(REFERENCE_VECTORS)(
    '@node-rs/argon2 reproduces src/test.c: t=%i m=2^%i p=%i %s/%s',
    (passes, log2Memory, lanes, password, salt, rawHex, phc) => {
      const options = {
        algorithm: ARGON2ID,
        timeCost: passes,
        memoryCost: 2 ** log2Memory,
        parallelism: lanes,
        outputLen: 32,
        salt: Buffer.from(salt),
      };
      expect(hashRawSync(password, options).toString('hex')).toBe(rawHex);
      expect(hashSync(password, options)).toBe(phc);
    },
  );

  it('node:crypto reproduces RFC 9106 §5.3, which uses a secret and associated data', () => {
    const v = RFC_9106_ARGON2ID;
    const tag = argon2Sync('argon2id', {
      message: v.password,
      nonce: v.salt,
      secret: v.secret,
      associatedData: v.associatedData,
      memory: v.memory,
      passes: v.passes,
      parallelism: v.parallelism,
      tagLength: 32,
    });
    expect(tag.toString('hex')).toBe(v.tag);
  });
});

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher(PEPPER);

  it('stores PHC strings with the production parameters and a random 16-byte salt', async () => {
    const first = phcFields(await hasher.hash(PASSWORD));
    const second = phcFields(await hasher.hash(PASSWORD));
    expect(first.params).toBe('m=19456,t=2,p=1');
    expect(first.salt.length).toBe(16);
    expect(first.hash.length).toBe(32);
    expect(first.salt.equals(second.salt)).toBe(false);
  });

  it('computes exactly the Argon2id output of node:crypto with the pepper as the secret', async () => {
    const stored = phcFields(await hasher.hash(PASSWORD));
    const expected = argon2Sync('argon2id', {
      message: PASSWORD,
      nonce: stored.salt,
      secret: PEPPER,
      memory: PASSWORD_HASH_OPTIONS.memoryCost,
      passes: PASSWORD_HASH_OPTIONS.timeCost,
      parallelism: PASSWORD_HASH_OPTIONS.parallelism,
      tagLength: PASSWORD_HASH_OPTIONS.outputLen,
    });
    expect(stored.hash.equals(expected)).toBe(true);
  });

  it('verifies only the right password under the same pepper', async () => {
    const stored = await hasher.hash(PASSWORD);
    expect(await hasher.verify(stored, PASSWORD)).toBe(true);
    expect(await hasher.verify(stored, `${PASSWORD}!`)).toBe(false);
    expect(await new PasswordHasher(Buffer.alloc(32, 0x5b)).verify(stored, PASSWORD)).toBe(false);
  });

  it('normalizes with NFKC before hashing, matching the length rule in contracts', async () => {
    const stored = await hasher.hash('\uFB01'.repeat(8));
    expect(await hasher.verify(stored, 'fi'.repeat(8))).toBe(true);
  });

  it('treats a malformed stored hash as a failed verification', async () => {
    expect(await hasher.verify('not a phc string', PASSWORD)).toBe(false);
    expect(await hasher.verify('$argon2id$v=19$m=19456,t=2,p=1$AAAA$', PASSWORD)).toBe(false);
  });

  it('refuses to answer for unknown users before prepare() has made the dummy hash', async () => {
    await expect(new PasswordHasher(PEPPER).verifyUnknownUser(PASSWORD)).rejects.toThrow(
      /prepare\(\) must complete/,
    );
  });

  it('after prepare(), answers false for unknown users with one verification and no hashing', async () => {
    const prepared = new PasswordHasher(PEPPER);
    await prepared.prepare();
    const hash = vi.spyOn(prepared, 'hash');
    const verify = vi.spyOn(prepared, 'verify');
    expect(await prepared.verifyUnknownUser(PASSWORD)).toBe(false);
    expect(await prepared.verifyUnknownUser('an unused password for timing only')).toBe(false);
    expect(hash).not.toHaveBeenCalled();
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it('asks for a rehash when the parameters differ from the current ones', async () => {
    expect(hasher.needsRehash(await hasher.hash(PASSWORD))).toBe(false);
    const weaker = await hash(PASSWORD, { ...PASSWORD_HASH_OPTIONS, timeCost: 1, secret: PEPPER });
    expect(hasher.needsRehash(weaker)).toBe(true);
    expect(hasher.needsRehash('not a phc string')).toBe(true);
  });

  it('refuses a pepper shorter than 32 bytes', () => {
    expect(() => new PasswordHasher(Buffer.alloc(31))).toThrow(/at least 32 bytes/);
  });
});
