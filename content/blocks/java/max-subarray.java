static long maxSubarraySum(int[] values) {
  if (values.length == 0) {
    throw new IllegalArgumentException("values must not be empty");
  }
  long best = values[0];
  long current = values[0];
  for (int i = 1; i < values.length; i++) {
    current = Math.max(values[i], current + values[i]);
    best = Math.max(best, current);
  }
  return best;
}
