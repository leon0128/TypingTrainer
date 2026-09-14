static int[] countingSort(int[] values, int maxValue) {
  int[] counts = new int[maxValue + 1];
  for (int value : values) {
    if (value < 0 || value > maxValue) {
      throw new IllegalArgumentException("value out of range: " + value);
    }
    counts[value]++;
  }
  int[] sorted = new int[values.length];
  int index = 0;
  for (int value = 0; value <= maxValue; value++) {
    Arrays.fill(sorted, index, index + counts[value], value);
    index += counts[value];
  }
  return sorted;
}
