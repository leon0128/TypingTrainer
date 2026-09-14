const cache = new Map<number, bigint>();
function fibonacci(n: number): bigint {
  if (n < 2) {
    return BigInt(n);
  }
  const cached = cache.get(n);
  if (cached !== undefined) {
    return cached;
  }
  const value = fibonacci(n - 1) + fibonacci(n - 2);
  cache.set(n, value);
  return value;
}
