static String longestCommonPrefix(String... words) {
  if (words.length == 0) {
    return "";
  }
  String prefix = words[0];
  for (String word : words) {
    while (!word.startsWith(prefix)) {
      prefix = prefix.substring(0, prefix.length() - 1);
    }
  }
  return prefix;
}
