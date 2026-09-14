function binarySearch(sorted: readonly number[], target: number): number {
  let low = 0;
  let high = sorted.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const value = sorted[middle];
    if (value === target) {
      return middle;
    }
    if (value < target) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return -1;
}
