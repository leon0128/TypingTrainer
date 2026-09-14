static Collection<List<String>> groupAnagrams(List<String> words) {
  Map<String, List<String>> groups = new HashMap<>();
  for (String word : words) {
    char[] letters = word.toCharArray();
    Arrays.sort(letters);
    groups.computeIfAbsent(new String(letters), key -> new ArrayList<>()).add(word);
  }
  return groups.values();
}
