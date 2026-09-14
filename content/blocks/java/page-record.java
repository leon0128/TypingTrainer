record Page<T>(List<T> items, int number, int size) {
  Page {
    Objects.requireNonNull(items, "items");
    if (number < 1 || size < 1) {
      throw new IllegalArgumentException("number and size must be positive");
    }
    items = List.copyOf(items);
  }
}
