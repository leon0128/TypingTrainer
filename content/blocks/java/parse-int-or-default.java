static int parseIntOrDefault(String text, int fallback) {
  if (text == null) {
    return fallback;
  }
  try {
    return Integer.parseInt(text.strip());
  } catch (NumberFormatException e) {
    System.err.println("not an integer: " + text);
    return fallback;
  }
}
