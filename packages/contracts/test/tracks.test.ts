import { describe, expect, it } from 'vitest';

import {
  CODE_LANGUAGES,
  CONTENT_LANGUAGES,
  NATURAL_POOLS,
  POOLS,
  POOL_KINDS,
  TRACKS,
  TRACK_POOLS,
  poolKindOf,
  trackOf,
} from '../src';

describe('pools and tracks', () => {
  it('lists every pool once, code first, in the order of the languages table', () => {
    expect(CONTENT_LANGUAGES).toEqual([...CODE_LANGUAGES, ...NATURAL_POOLS]);
    expect(new Set(CONTENT_LANGUAGES).size).toBe(CONTENT_LANGUAGES.length);
    expect(CONTENT_LANGUAGES).toHaveLength(10);
  });

  it('places every pool on exactly one track', () => {
    const placed = TRACKS.flatMap((track) => [...TRACK_POOLS[track]]);
    expect([...placed].sort()).toEqual([...CONTENT_LANGUAGES].sort());
    for (const track of TRACKS) {
      for (const pool of TRACK_POOLS[track]) expect(trackOf(pool)).toBe(track);
    }
  });

  it('puts the programming languages on the code track, with no kind', () => {
    expect(TRACK_POOLS.code).toEqual([...CODE_LANGUAGES]);
    for (const language of CODE_LANGUAGES) expect(poolKindOf(language)).toBeNull();
  });

  it.each(['natural-ja', 'natural-en'] as const)(
    'gives the %s track one pool of each kind, named after its language and kind',
    (track) => {
      const prefix = track === 'natural-ja' ? 'ja' : 'en';
      expect(TRACK_POOLS[track].map((pool) => poolKindOf(pool))).toEqual([...POOL_KINDS]);
      for (const pool of TRACK_POOLS[track]) {
        expect(pool).toBe(`${prefix}-${String(POOLS[pool].kind)}`);
      }
    },
  );
});
