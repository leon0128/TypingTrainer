static Map<Boolean, List<String>> passedAndFailed(Map<String, Integer> grades) {
  return grades.entrySet().stream()
      .collect(
          Collectors.partitioningBy(
              entry -> entry.getValue() >= 60,
              Collectors.mapping(Map.Entry::getKey, Collectors.toList())));
}
