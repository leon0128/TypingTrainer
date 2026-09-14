static <T> Predicate<T> allOf(List<? extends Predicate<? super T>> rules) {
  List<Predicate<? super T>> copy = List.copyOf(rules);
  return value -> {
    for (Predicate<? super T> rule : copy) {
      if (!rule.test(value)) {
        return false;
      }
    }
    return true;
  };
}
