static <T extends Comparable<? super T>> int binarySearch(List<T> sorted, T key) {
  int low = 0;
  int high = sorted.size() - 1;
  while (low <= high) {
    int mid = (low + high) >>> 1;
    int cmp = sorted.get(mid).compareTo(key);
    if (cmp < 0) {
      low = mid + 1;
    } else if (cmp > 0) {
      high = mid - 1;
    } else {
      return mid;
    }
  }
  return -(low + 1);
}
