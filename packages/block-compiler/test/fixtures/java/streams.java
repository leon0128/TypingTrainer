static List<String> nonEmptyTrimmed(List<String> lines) {
  List<String> result = new ArrayList<>();
  lines.stream().map(String::trim).filter(s -> !s.isEmpty()).forEach(result::add);
  return result;
}
