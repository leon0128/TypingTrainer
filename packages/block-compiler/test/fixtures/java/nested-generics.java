static Map<String, List<Integer>> group(List<String> words) {
  Map<String, List<Integer>> lengths = new HashMap<>();
  for (String word : words) {
    lengths.computeIfAbsent(word.substring(0, 1), key -> new ArrayList<>()).add(word.length());
  }
  return lengths;
}
