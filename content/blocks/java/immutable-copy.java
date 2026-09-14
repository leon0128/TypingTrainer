static Map<String, List<Integer>> freezeIndex(Map<String, List<Integer>> index) {
  var frozen = new TreeMap<String, List<Integer>>();
  for (var entry : index.entrySet()) {
    var positions = new ArrayList<>(entry.getValue());
    Collections.sort(positions);
    frozen.put(entry.getKey(), List.copyOf(positions));
  }
  return Collections.unmodifiableMap(frozen);
}
