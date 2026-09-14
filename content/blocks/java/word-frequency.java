static Map<String, Long> wordFrequency(String text) {
  return Arrays.stream(text.toLowerCase().split("\\W+"))
      .filter(word -> !word.isEmpty())
      .collect(Collectors.groupingBy(w -> w, TreeMap::new, Collectors.counting()));
}
