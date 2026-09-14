record IntRange(int start, int end) implements Iterable<Integer> {
  public Iterator<Integer> iterator() {
    if (start > end) {
      throw new IllegalStateException("start " + start + " is after end " + end);
    }
    return IntStream.range(start, end).iterator();
  }
}
