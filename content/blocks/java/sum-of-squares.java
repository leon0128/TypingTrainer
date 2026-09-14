static long sumOfOddSquares(int limit) {
  return IntStream.rangeClosed(1, limit)
      .filter(n -> n % 2 == 1)
      .mapToLong(n -> (long) n * n)
      .sum();
}
