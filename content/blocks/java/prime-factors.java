static List<Long> primeFactors(long n) {
  if (n < 2) {
    throw new IllegalArgumentException("n must be at least 2: " + n);
  }
  List<Long> factors = new ArrayList<>();
  for (long p = 2; p * p <= n; p++) {
    while (n % p == 0) {
      factors.add(p);
      n /= p;
    }
  }
  if (n > 1) {
    factors.add(n);
  }
  return factors;
}
