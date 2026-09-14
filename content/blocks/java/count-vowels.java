static int countVowels(String text) {
  int count = 0;
  for (char c : text.toLowerCase().toCharArray()) {
    switch (c) {
      case 'a', 'e', 'i', 'o', 'u' -> count++;
      default -> {}
    }
  }
  return count;
}
