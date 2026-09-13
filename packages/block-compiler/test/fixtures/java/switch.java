static int score(String grade) {
  return switch (grade) {
    case "A", "B" -> 2;
    case "C" -> {
      int base = 1;
      yield base;
    }
    default -> 0;
  };
}
