static <T> int copyMatching(
    Collection<? extends T> from, Collection<? super T> to, Predicate<? super T> keep) {
  int copied = 0;
  for (T item : from) {
    if (keep.test(item)) {
      to.add(item);
      copied++;
    }
  }
  return copied;
}
