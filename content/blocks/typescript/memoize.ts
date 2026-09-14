function memoize<A extends string | number, R>(
  fn: (arg: A) => R,
): (arg: A) => R {
  const cache = new Map<A, R>();
  return (arg) => {
    if (cache.has(arg)) {
      return cache.get(arg) as R;
    }
    const result = fn(arg);
    cache.set(arg, result);
    return result;
  };
}
