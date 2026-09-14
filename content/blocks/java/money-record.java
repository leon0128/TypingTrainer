record Money(long cents, String currency) {
  Money plus(Money other) {
    if (!currency.equals(other.currency)) {
      throw new IllegalArgumentException("currency mismatch: " + other.currency);
    }
    return new Money(Math.addExact(cents, other.cents), currency);
  }
}
