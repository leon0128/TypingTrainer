function first<T>(items: Array<T>): T | undefined {
  const cache: Map<string, Array<number>> = new Map();
  return items[0];
}
