static long fibonacci(int n) {
  if (n < 0) {
    throw new IllegalArgumentException("n must not be negative: " + n);
  }
  long previous = 0;
  long current = 1;
  for (int i = 0; i < n; i++) {
    long next = Math.addExact(previous, current);
    previous = current;
    current = next;
  }
  return previous;
}
