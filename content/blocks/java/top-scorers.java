static List<String> topScorers(Map<String, Integer> scores, int limit) {
  return scores.entrySet().stream()
      .sorted(
          Map.Entry.<String, Integer>comparingByValue()
              .reversed()
              .thenComparing(Map.Entry.comparingByKey()))
      .limit(limit)
      .map(entry -> entry.getKey() + " (" + entry.getValue() + ")")
      .toList();
}
