// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { applyLocale } from '../src/i18n';
import { describeError } from '../src/lib/api/describe-error';
import { translateServerMessage } from '../src/lib/api/error-messages';
import { ApiRequestError, ContractError, NetworkError } from '../src/lib/api/errors';

afterEach(async () => {
  await applyLocale('en');
});

/** The API's and the contracts' own sources, read as text so a new message cannot slip by. */
const SOURCES = {
  ...import.meta.glob('../../api/src/**/*.ts', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../../../packages/contracts/src/**/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
} as Record<string, string>;

/**
 * Sources whose messages a player can be shown. Left out on purpose, and shown as they are if they
 * ever appear: `config/` (start-up errors for whoever runs the server), and the contracts for
 * content bundles, typing programs, session logs, dashboard queries, play requests, and preferences,
 * whose rules only a hand-made request can break — this client never sends one. Sign-in and
 * registration (`auth.ts`) are the contract rules a player meets.
 */
function isPlayerFacing(file: string): boolean {
  if (file.includes('packages/contracts/')) return file.endsWith('/auth.ts');
  return !file.includes('/config/');
}

/** What a template's `${...}` stands for, chosen so the sentence is one the API could really send. */
function withSampleValues(literal: string): string {
  const sample = literal.includes('characters')
    ? '8'
    : literal.includes('result rejected')
      ? 'speed'
      : literal.includes('record for')
        ? 'daily'
        : 'x';
  return literal.replace(/\$\{[^}]*\}/g, sample);
}

/** Every message a player can be shown that the API or a contract wrote, as it would read. */
function writtenMessages(): { file: string; message: string }[] {
  const found: { file: string; message: string }[] = [];
  const add = (file: string, literal: string | undefined) => {
    if (literal !== undefined) found.push({ file, message: withSampleValues(literal) });
  };
  for (const [file, source] of Object.entries(SOURCES)) {
    if (!isPlayerFacing(file)) continue;
    const isContract = file.includes('packages/contracts/');
    if (!isContract) {
      // A thrown HTTP exception: `new SomethingException('...')`.
      for (const match of source.matchAll(
        /new \w+Exception\(\s*(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g,
      )) {
        add(file, match[2]);
      }
      // The rate limiter's own: `super('...', HttpStatus.TOO_MANY_REQUESTS)`.
      for (const match of source.matchAll(/super\(\s*'([^']*)'\s*,\s*HttpStatus/g))
        add(file, match[1]);
      // An error body built by hand: `message: '...'`.
      for (const match of source.matchAll(/message:\s*'([^']*)'/g)) add(file, match[1]);
    } else {
      for (const match of source.matchAll(/message:\s*(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
        add(file, match[2]);
      }
      for (const match of source.matchAll(
        /\.(?:min|max|regex)\(\s*[^,]+,\s*(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g,
      )) {
        add(file, match[2]);
      }
    }
  }
  return found;
}

describe('the messages the API and the contracts write', () => {
  const messages = writtenMessages();

  it('are found in the sources at all (so this check cannot pass by finding nothing)', () => {
    expect(messages.length).toBeGreaterThanOrEqual(15);
    expect(messages.map((entry) => entry.message)).toContain('username is taken');
    expect(messages.map((entry) => entry.message)).toContain('must be at least 8 characters');
    expect(messages.map((entry) => entry.message)).toContain('too many attempts; try again later');
  });

  it.each(['en', 'ja'] as const)('all have a %s translation', async (language) => {
    await applyLocale(language);
    const unknown = messages.filter(({ message }) => translateServerMessage(message) === null);
    expect(unknown, `add these to error-messages.ts: ${JSON.stringify(unknown)}`).toEqual([]);
  });

  it('read in Japanese, not as the English they were written in', async () => {
    await applyLocale('ja');
    for (const { message } of messages) {
      expect(translateServerMessage(message), message).toMatch(/[぀-ヿ一-鿿]/);
    }
  });
});

describe('translating a message', () => {
  it('leaves English as the API wrote it', () => {
    expect(translateServerMessage('username is taken')).toBe('username is taken');
    expect(translateServerMessage('invalid username or password')).toBe(
      'invalid username or password',
    );
    expect(translateServerMessage('password: must be at least 8 characters')).toBe(
      'password: must be at least 8 characters',
    );
  });

  it('translates each kind of message into Japanese', async () => {
    await applyLocale('ja');
    expect(translateServerMessage('username is taken')).toBe('そのユーザー名は使われています');
    expect(translateServerMessage('language "go" is not available')).toBe(
      '言語「go」は利用できません',
    );
    expect(translateServerMessage('there is no record for weekly to race')).toBe(
      '今週の記録がないため、対戦できません',
    );
    expect(translateServerMessage('result rejected: idle')).toBe(
      '結果が受理されませんでした: 放置時間が長すぎます',
    );
  });

  it('translates a validation message with its field, and without one', async () => {
    await applyLocale('ja');
    expect(translateServerMessage('password: must be at least 8 characters')).toBe(
      'パスワード: 8文字以上にしてください',
    );
    expect(translateServerMessage('username: must be at most 24 characters')).toBe(
      'ユーザー名: 24文字以内にしてください',
    );
    // The client checks with the same schema and gets the message without a field.
    expect(translateServerMessage('must not be the username')).toBe(
      'ユーザー名と同じにはできません',
    );
    expect(translateServerMessage('timezone: must be an IANA time zone name')).toBe(
      'タイムゾーン: IANA のタイムゾーン名で指定してください',
    );
  });

  it('keeps an unknown field name as it is', async () => {
    await applyLocale('ja');
    expect(translateServerMessage('nickname: must be at least 3 characters')).toBe(
      'nickname: 3文字以上にしてください',
    );
  });

  it('gives up on a message it does not know, so it is shown as it came', () => {
    expect(translateServerMessage('Invalid input: expected string, received undefined')).toBeNull();
    expect(translateServerMessage('something new the API says')).toBeNull();
    // An almost-match is not a match.
    expect(translateServerMessage('username is taken!')).toBeNull();
    expect(translateServerMessage('password: must be at least many characters')).toBeNull();
  });
});

describe('describeError', () => {
  it.each([
    ['en', 'The server could not be reached. Check your connection.'],
    ['ja', 'サーバーに接続できません。通信環境を確認してください。'],
  ] as const)('describes a failed connection in %s', async (language, expected) => {
    await applyLocale(language);
    expect(describeError(new NetworkError(new TypeError('Failed to fetch')))).toBe(expected);
  });

  it('describes an unexpected response and anything else, in both languages', async () => {
    expect(describeError(new ContractError('/x', 'bad'))).toBe(
      'The server sent an unexpected response.',
    );
    expect(describeError(new Error('boom'))).toBe('Something went wrong.');
    await applyLocale('ja');
    expect(describeError(new ContractError('/x', 'bad'))).toBe(
      'サーバーから想定外の応答がありました。',
    );
    expect(describeError(new Error('boom'))).toBe('問題が発生しました。');
  });

  it('shows what the API said, translated when it is known and as it is when not', async () => {
    expect(describeError(new ApiRequestError(409, 'username is taken'))).toBe('username is taken');
    expect(describeError(new ApiRequestError(400, 'something new'))).toBe('something new');
    await applyLocale('ja');
    expect(describeError(new ApiRequestError(409, 'username is taken'))).toBe(
      'そのユーザー名は使われています',
    );
    expect(describeError(new ApiRequestError(400, 'something new'))).toBe('something new');
  });

  it('describes a server fault plainly instead of its status text', async () => {
    expect(describeError(new ApiRequestError(500, 'Internal Server Error'))).toBe(
      'The server had a problem. Try again in a moment.',
    );
    await applyLocale('ja');
    expect(describeError(new ApiRequestError(502, 'Bad Gateway'))).toBe(
      'サーバーで問題が発生しました。しばらくしてからもう一度お試しください。',
    );
  });

  it('adds when to try again to a refusal, in the right plural', async () => {
    const refused = (seconds: number) =>
      describeError(new ApiRequestError(429, 'too many attempts; try again later', seconds));
    expect(refused(1)).toBe('too many attempts; try again later — try again in 1 second.');
    expect(refused(45)).toBe('too many attempts; try again later — try again in 45 seconds.');
    await applyLocale('ja');
    expect(refused(45)).toBe(
      '試行回数が多すぎます。しばらくしてからお試しください — 45秒後にもう一度お試しください。',
    );
  });
});
