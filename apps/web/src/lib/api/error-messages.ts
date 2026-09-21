import type { ParseKeys } from 'i18next';

import { i18n } from '../../i18n';

/** A message the API writes in English (§9.5), and how it reads in the player's language. */
interface Rule {
  readonly pattern: RegExp;
  readonly key: ParseKeys;
  /** The interpolation values, from the pattern's capture groups. */
  readonly values?: (match: RegExpMatchArray) => Record<string, string>;
}

const PERIOD_WORDS = { daily: 'daily', weekly: 'weekly', total: 'total' } as const;

const REJECTIONS = {
  'log-start': 'rejection.logStart',
  'keys-after-end': 'rejection.keysAfterEnd',
  'run-time': 'rejection.runTime',
  idle: 'rejection.idle',
  speed: 'rejection.speed',
  progress: 'rejection.progress',
} as const;

/**
 * The key is checked where each rule is written (`ParseKeys`), so looking it up here can be loose:
 * i18next's own overloads cannot take a key that is only known to be some valid key.
 */
const translate = (key: ParseKeys, values?: Record<string, string>): string =>
  (i18n.t as (key: string, options: object) => string)(key, values ?? {});

/**
 * Every message the API and the contracts can produce for a player, matched exactly. The API answers
 * in English only; the client translates the ones it knows. An unknown message is shown as it came,
 * and a test reads the API and contract sources to make sure a new one cannot be added without an
 * entry here.
 */
const RULES: readonly Rule[] = [
  { pattern: /^authentication required$/, key: 'errors.authRequired' },
  { pattern: /^username is taken$/, key: 'errors.usernameTaken' },
  { pattern: /^invalid username or password$/, key: 'errors.invalidCredentials' },
  { pattern: /^incorrect password$/, key: 'errors.incorrectPassword' },
  {
    pattern: /^language "(.*)" is not available$/,
    key: 'errors.languageUnavailable',
    values: (match) => ({ language: match[1] ?? '' }),
  },
  {
    pattern: /^language "(.*)" is not available for this account$/,
    key: 'errors.languageForbidden',
    values: (match) => ({ language: match[1] ?? '' }),
  },
  {
    pattern: /^track "(.*)" is not available for this account$/,
    key: 'errors.trackForbidden',
    values: (match) => ({ track: match[1] ?? '' }),
  },
  { pattern: /^run not found$/, key: 'errors.runNotFound' },
  { pattern: /^no such run$/, key: 'errors.noSuchRun' },
  { pattern: /^this run is too old to submit; play again$/, key: 'errors.runTooOld' },
  { pattern: /^this run was already submitted$/, key: 'errors.runAlreadySubmitted' },
  {
    pattern: /^the content changed since this run was issued; play again$/,
    key: 'errors.contentChanged',
  },
  {
    pattern: /^there is no record for (daily|weekly|total|that period) to race$/,
    key: 'errors.noRecord',
    values: (match) => {
      const period = match[1] ?? '';
      return {
        period:
          period in PERIOD_WORDS
            ? translate(`periods.${PERIOD_WORDS[period as keyof typeof PERIOD_WORDS]}`)
            : period,
      };
    },
  },
  { pattern: /^too many attempts; try again later$/, key: 'errors.tooManyAttempts' },
  { pattern: /^cross-origin request refused$/, key: 'errors.crossOrigin' },
  { pattern: /^request bodies must be application\/json$/, key: 'errors.notJson' },
  {
    pattern: /^result rejected: (log-start|keys-after-end|run-time|idle|speed|progress)$/,
    key: 'errors.resultRejected',
    values: (match) => ({ reason: translate(REJECTIONS[match[1] as keyof typeof REJECTIONS]) }),
  },
];

/** Validation messages from the contracts, alone or after a `field: ` prefix (§9.4). */
const VALIDATION_RULES: readonly Rule[] = [
  {
    pattern: /^must be at least (\d+) characters$/,
    key: 'validation.tooShort',
    values: (match) => ({ min: match[1] ?? '' }),
  },
  {
    pattern: /^must be at most (\d+) characters$/,
    key: 'validation.tooLong',
    values: (match) => ({ max: match[1] ?? '' }),
  },
  {
    pattern: /^may contain only letters, digits, "_" and "-", starting with a letter or digit$/,
    key: 'validation.usernamePattern',
  },
  { pattern: /^must not be empty$/, key: 'validation.displayNameEmpty' },
  { pattern: /^must not contain control characters$/, key: 'validation.displayNameControl' },
  { pattern: /^must be an IANA time zone name$/, key: 'validation.timezone' },
  { pattern: /^must not be the username$/, key: 'validation.passwordIsUsername' },
];

const FIELDS = {
  username: 'fields.username',
  displayName: 'fields.displayName',
  password: 'fields.password',
  timezone: 'fields.timezone',
  language: 'fields.language',
} as const;

function applyRule(rules: readonly Rule[], message: string): string | null {
  for (const rule of rules) {
    const match = rule.pattern.exec(message);
    if (match !== null) return translate(rule.key, rule.values?.(match));
  }
  return null;
}

/**
 * The player's-language form of a message the API or the contracts wrote, or null when it is not one
 * this client knows (it is then shown as it came).
 */
export function translateServerMessage(message: string): string | null {
  const direct = applyRule(RULES, message);
  if (direct !== null) return direct;

  const prefixed = /^(?:([a-z][A-Za-z]*): )?(.*)$/s.exec(message);
  const field = prefixed?.[1];
  const tail = applyRule(VALIDATION_RULES, prefixed?.[2] ?? message);
  if (tail === null) return null;
  if (field === undefined) return tail;
  const label = field in FIELDS ? translate(FIELDS[field as keyof typeof FIELDS]) : field;
  return `${label}: ${tail}`;
}
