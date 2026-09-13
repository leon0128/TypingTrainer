import { describe, expect, it } from 'vitest';

import { MAX_SESSION_KEYS, SessionLogSchema } from '../src';

const issues = (input: unknown) => {
  const result = SessionLogSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('SessionLogSchema', () => {
  it('accepts keys with one delta each, including Enter and Tab', () => {
    expect(issues({ version: 1, keys: 'a\n\tb', deltas: [0, 120, 95, 110] })).toEqual([]);
    expect(issues({ version: 1, keys: '', deltas: [] })).toEqual([]);
  });

  it('counts keys by code point', () => {
    expect(issues({ version: 1, keys: 'å😀', deltas: [0, 10] })).toEqual([]);
  });

  it('rejects a key count that does not match the deltas', () => {
    expect(issues({ version: 1, keys: 'ab', deltas: [0] })).toEqual(['1 deltas for 2 keys']);
  });

  it('rejects negative or fractional deltas and unknown versions', () => {
    expect(SessionLogSchema.safeParse({ version: 1, keys: 'a', deltas: [-1] }).success).toBe(false);
    expect(SessionLogSchema.safeParse({ version: 1, keys: 'a', deltas: [0.5] }).success).toBe(
      false,
    );
    expect(SessionLogSchema.safeParse({ version: 2, keys: 'a', deltas: [0] }).success).toBe(false);
  });

  it('rejects more keys than a run can hold', () => {
    const keys = 'a'.repeat(MAX_SESSION_KEYS + 1);
    const deltas = Array.from({ length: MAX_SESSION_KEYS + 1 }, () => 1);
    expect(SessionLogSchema.safeParse({ version: 1, keys, deltas }).success).toBe(false);
  });
});
