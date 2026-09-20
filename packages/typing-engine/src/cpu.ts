import type { TypingProgram } from '@typing-trainer/contracts';

import { ENTER_KEY, SPACE_KEY, withTypedClosers } from './engine';
import { PLAY_DURATION_MS, computeMetrics } from './metrics';
import { MAX_SEED, createSeededRandom, type SeededRandom } from './random';

/** Levels run from 1 to 100 (§4.3.2). */
export const CPU_MIN_LEVEL = 1;
export const CPU_MAX_LEVEL = 100;

const LEVEL_1_KPM = 50;
const LEVEL_100_KPM = 800;

/** Per-block multiplier: truncated normal around 1, clipped to ±6% (§4.3.3). */
const BLOCK_SIGMA = 0.02;
const BLOCK_MIN = 0.94;
const BLOCK_MAX = 1.06;
/** Per-keystroke jitter: log-normal with this σ (§4.3.3). */
const JITTER_SIGMA = 0.2;

/**
 * XORed into the run's seed so the opponent's randomness is a stream of its own and is not
 * correlated with the shuffle that drew the blocks. The level is deliberately not mixed in: the
 * same seed gives the same "form on the day" at every level.
 */
const CPU_STREAM = 0x2545_f491_4f6c_dd1dn;
/** A second stream for the jitter, so a block's multiplier never depends on how many keys it has. */
const JITTER_STREAM = 0x1b87_3593_cc9e_2d51n;

/** The level's target speed: geometric interpolation from 50 to 800 KPM (§4.3.2). */
export function cpuBaseKpm(level: number): number {
  assertLevel(level);
  return LEVEL_1_KPM * (LEVEL_100_KPM / LEVEL_1_KPM) ** ((level - 1) / (CPU_MAX_LEVEL - 1));
}

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < CPU_MIN_LEVEL || level > CPU_MAX_LEVEL) {
    throw new RangeError(
      `A CPU level is an integer from ${String(CPU_MIN_LEVEL)} to ${String(CPU_MAX_LEVEL)}`,
    );
  }
}

/** A uniform number strictly between 0 and 1, so its logarithm is always finite. */
function uniform(random: SeededRandom): number {
  return (random.nextUint32() + 0.5) / 0x1_0000_0000;
}

/** A standard normal by the Box–Muller transform. */
function normal(random: SeededRandom): number {
  return Math.sqrt(-2 * Math.log(uniform(random))) * Math.cos(2 * Math.PI * uniform(random));
}

function blockMultiplier(random: SeededRandom): number {
  for (;;) {
    const value = 1 + BLOCK_SIGMA * normal(random);
    if (value >= BLOCK_MIN && value <= BLOCK_MAX) return value;
  }
}

/** The "form on the day" of each of the first `count` blocks (§4.3.3), for a run's seed. */
export function cpuBlockMultipliers(count: number, seed: bigint): number[] {
  const random = createSeededRandom(seed ^ CPU_STREAM);
  return Array.from({ length: count }, () => blockMultiplier(random));
}

/** Keys that need Shift on a US layout, apart from uppercase letters. */
const SHIFTED_SYMBOLS = new Set('~!@#$%^&*()_+{}|:"<>?');

/**
 * How much slower a key is than a lowercase letter (§4.3.3): lowercase and digits 1.0; anything
 * needing Shift 1.5, uppercase letters included; other symbols 1.3; separators, and a space typed
 * as part of a literal, 0.8.
 */
export function keyCost(key: string): number {
  if (key === ENTER_KEY || key === SPACE_KEY) return 0.8;
  if (/^[a-z0-9]$/.test(key)) return 1;
  if (/^[A-Z]$/.test(key) || SHIFTED_SYMBOLS.has(key)) return 1.5;
  return 1.3;
}

/**
 * What the CPU types in one block: its literals and separators, closing brackets included because
 * the player types them too (see `withTypedClosers`); only indentation is skipped.
 */
function blockKeys(program: TypingProgram): string[] {
  const keys: string[] = [];
  for (const atom of withTypedClosers(program).atoms) {
    if (atom.kind === 'literal') keys.push(...atom.text.split(''));
    else if (atom.kind === 'separator') keys.push(atom.canonical === '\n' ? ENTER_KEY : SPACE_KEY);
  }
  return keys;
}

/** The whole run's keys in order: the canonical keystroke of every block, one after another. */
export function cpuKeys(programs: readonly TypingProgram[]): string[] {
  return programs.flatMap(blockKeys);
}

/**
 * The run time at which the CPU types each key of `cpuKeys(programs)` (§4.3.3), starting from the
 * player's first key.
 *
 * A block's target speed is `cpuBaseKpm(level) × multiplier`. Its keys share that time in
 * proportion to their cost (normalized by the block's mean cost, so the block still takes
 * `keys / targetKpm`), and each interval is scaled by log-normal jitter whose *mean* is 1: the
 * median is `exp(−σ²/2)`, so jitter does not speed the CPU up by the ~2% a median of 1 would.
 * The block multipliers and the jitter come from two separate streams of the run's seed. The server and the client run this same function from the issued seed, so both see the same
 * opponent.
 */
export function cpuTimeline(
  programs: readonly TypingProgram[],
  level: number,
  seed: bigint,
): Float64Array {
  assertLevel(level);
  if (seed < 0n || seed > MAX_SEED) throw new RangeError('Invalid seed');
  const random = createSeededRandom(seed ^ JITTER_STREAM);
  const multipliers = cpuBlockMultipliers(programs.length, seed);
  const base = cpuBaseKpm(level);

  const times: number[] = [];
  let now = 0;
  for (const [index, program] of programs.entries()) {
    const keys = blockKeys(program);
    if (keys.length === 0) continue;
    const meanIntervalMs = 60_000 / (base * (multipliers[index] ?? 1));
    const costs = keys.map(keyCost);
    const meanCost = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
    for (const cost of costs) {
      const jitter = Math.exp(JITTER_SIGMA * normal(random) - (JITTER_SIGMA * JITTER_SIGMA) / 2);
      now += meanIntervalMs * (cost / meanCost) * jitter;
      times.push(now);
    }
  }
  return Float64Array.from(times);
}

/**
 * How many keys the CPU has typed when the run ends. A key counts when its time, rounded to a whole
 * millisecond as a player's is (`sessionKey`), is before the run's end.
 */
export function cpuEffectiveKeystrokes(timeline: Float64Array): number {
  let count = 0;
  while (count < timeline.length && Math.round(timeline[count] ?? Infinity) < PLAY_DURATION_MS) {
    count += 1;
  }
  return count;
}

/** The CPU's official score: it never misses, so accuracy is 100% and score equals KPM (Q28). */
export function cpuScore(timeline: Float64Array): number {
  const effective = cpuEffectiveKeystrokes(timeline);
  return computeMetrics({ effective, miss: 0, raw: effective }).score;
}

/** Win or lose against the CPU; a tie is a win (§4.3.4, Q16). */
export function judgeMatch(playerScore: number, opponentScore: number): 'win' | 'lose' {
  return playerScore >= opponentScore ? 'win' : 'lose';
}
