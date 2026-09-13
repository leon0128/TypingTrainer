static double sum(List<? extends Number> values, int... extra) {
  double total = 0;
  for (Number value : values) {
    total += value.doubleValue();
  }
  for (int n : extra) {
    total += n;
  }
  return total;
}
