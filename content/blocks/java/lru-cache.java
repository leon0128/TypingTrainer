static <K, V> Map<K, V> lruCache(int capacity) {
  return new LinkedHashMap<>(16, 0.75f, true) {
    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
      return size() > capacity;
    }
  };
}
