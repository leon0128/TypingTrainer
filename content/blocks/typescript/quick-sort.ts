function quickSort<T>(
  items: readonly T[],
  compare: (a: T, b: T) => number,
): T[] {
  if (items.length <= 1) {
    return [...items];
  }
  const [pivot, ...rest] = items;
  const smaller = rest.filter((item) => compare(item, pivot) < 0);
  const larger = rest.filter((item) => compare(item, pivot) >= 0);
  return [...quickSort(smaller, compare), pivot, ...quickSort(larger, compare)];
}
