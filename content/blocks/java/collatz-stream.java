static List<Long> collatz(long start) {
  if (start < 1) {
    throw new IllegalArgumentException("start must be positive");
  }
  return Stream.iterate(start, n -> n != 1, n -> n % 2 == 0 ? n / 2 : 3 * n + 1)
      .collect(Collectors.toCollection(ArrayList::new));
}
