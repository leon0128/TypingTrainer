static Map<String, Integer> countWords(List<String> lines) {
  ConcurrentMap<String, Integer> counts = new ConcurrentHashMap<>();
  lines.parallelStream()
      .flatMap(line -> Arrays.stream(line.split("\\s+")))
      .filter(word -> !word.isBlank())
      .forEach(word -> counts.merge(word.toLowerCase(), 1, Integer::sum));
  return counts;
}
