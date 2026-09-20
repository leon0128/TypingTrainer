import { PasswordHasher, PASSWORD_HASH_OPTIONS } from './modules/auth/password-hasher';

/**
 * Times password hashing with the production parameters (§7), for judging a host — the Raspberry
 * Pi 3 B+ fallback above all (§9.7). It uses the same PasswordHasher and PASSWORD_HASH_OPTIONS the
 * API does, so it can never drift from what sign-in actually costs. Run inside the API image:
 *
 *   docker run --rm --entrypoint node <api image> dist/argon2-bench.js [rounds]
 *
 * Sign-in verifies one hash and registration makes one, so these are the times a player waits. The
 * concurrent figure is several at once, which is what a burst of sign-ins costs in time and memory
 * (each in-flight hash holds `memoryCost` KiB).
 */
const rounds = Number(process.argv[2] ?? 20);
const hasher = new PasswordHasher(Buffer.alloc(32, 7));

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
const format = (ms: number) => `${ms.toFixed(1)} ms`;

async function timed(work: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await work();
  return performance.now() - start;
}

await hasher.hash('warm up the native module and the allocator');

const hashTimes: number[] = [];
const verifyTimes: number[] = [];
const stored = await hasher.hash('correct horse battery staple');
for (let round = 0; round < rounds; round += 1) {
  hashTimes.push(await timed(() => hasher.hash('correct horse battery staple')));
  verifyTimes.push(await timed(() => hasher.verify(stored, 'correct horse battery staple')));
}

const burst = 4;
const burstTime = await timed(() =>
  Promise.all(
    Array.from({ length: burst }, () => hasher.verify(stored, 'correct horse battery staple')),
  ),
);

const { memoryCost, timeCost, parallelism } = PASSWORD_HASH_OPTIONS;
console.log(
  `argon2id m=${String(memoryCost)} KiB, t=${String(timeCost)}, p=${String(parallelism)}, ${String(rounds)} rounds`,
);
console.log(`hash    median ${format(median(hashTimes))}  max ${format(Math.max(...hashTimes))}`);
console.log(
  `verify  median ${format(median(verifyTimes))}  max ${format(Math.max(...verifyTimes))}`,
);
console.log(`${String(burst)} verifies at once: ${format(burstTime)} in total`);
console.log(`peak RSS ${String(Math.round(process.resourceUsage().maxRSS / 1024))} MiB`);
