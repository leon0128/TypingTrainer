import { createSeededRandom, type SeededRandom } from './random';

/** Blocks issued with every run (§5.3). */
export const RUN_BLOCK_COUNT = 20;

function swap(items: string[], first: number, second: number): void {
  const a = items[first];
  const b = items[second];
  if (a === undefined || b === undefined) throw new RangeError('Swap index out of range');
  items[first] = b;
  items[second] = a;
}

function shuffled(items: readonly string[], random: SeededRandom): string[] {
  const order = [...items];
  for (let index = order.length - 1; index > 0; index -= 1) {
    swap(order, index, random.nextInt(index + 1));
  }
  return order;
}

/**
 * The block sequence of a run (§5.3): the language's pool shuffled with the run's seed and drawn
 * without replacement. If the pool runs out mid-run it is reshuffled, and the block just played is
 * moved off the front so the same block never appears twice in a row. Pool order does not matter:
 * ids are sorted before shuffling, so the seed alone determines the sequence.
 */
export function drawBlockIds(
  poolIds: readonly string[],
  seed: bigint,
  count: number = RUN_BLOCK_COUNT,
): string[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(`A run draws at least one block, not ${String(count)}`);
  }
  const pool = [...poolIds].sort();
  if (pool.length === 0) throw new RangeError('The block pool is empty');
  if (new Set(pool).size !== pool.length) throw new RangeError('The block pool has duplicate ids');
  if (pool.length === 1 && count > 1) {
    throw new RangeError('A single-block pool cannot avoid repeating a block');
  }

  const random = createSeededRandom(seed);
  const drawn: string[] = [];
  while (drawn.length < count) {
    const cycle = shuffled(pool, random);
    if (drawn.length > 0 && cycle[0] === drawn.at(-1)) {
      swap(cycle, 0, 1 + random.nextInt(cycle.length - 1));
    }
    drawn.push(...cycle.slice(0, count - drawn.length));
  }
  return drawn;
}
