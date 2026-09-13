static String firstLine(Path path) throws IOException {
  try (BufferedReader reader = Files.newBufferedReader(path)) {
    return reader.readLine();
  } catch (UncheckedIOException | SecurityException e) {
    throw new IOException("cannot read " + path, e);
  }
}
