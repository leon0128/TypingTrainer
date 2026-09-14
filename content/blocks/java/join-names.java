static String joinInitials(List<String> fullNames) {
  return fullNames.stream()
      .map(String::strip)
      .filter(Predicate.not(String::isEmpty))
      .map(name -> name.substring(0, 1).toUpperCase(Locale.ROOT))
      .distinct()
      .collect(Collectors.joining(", ", "[", "]"));
}
