static List<String> readRequiredLines(Path path) {
  try {
    List<String> lines = Files.readAllLines(path);
    if (lines.isEmpty()) {
      throw new IllegalStateException(path + " is empty");
    }
    return lines;
  } catch (NoSuchFileException e) {
    throw new IllegalArgumentException("missing file: " + path, e);
  } catch (IOException e) {
    throw new UncheckedIOException(e);
  }
}
