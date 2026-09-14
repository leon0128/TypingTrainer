static String histogram(String text) {
  Map<Character, Integer> counts = new TreeMap<>();
  for (char c : text.toCharArray()) {
    if (Character.isLetter(c)) {
      counts.merge(Character.toLowerCase(c), 1, Integer::sum);
    }
  }
  StringBuilder chart = new StringBuilder();
  for (Map.Entry<Character, Integer> entry : counts.entrySet()) {
    String bar = "*".repeat(entry.getValue());
    chart.append(entry.getKey()).append(' ').append(bar).append('\n');
  }
  return chart.toString();
}
