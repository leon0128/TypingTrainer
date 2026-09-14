static Map<String, String> readProperties(Path path) throws IOException {
  Map<String, String> properties = new LinkedHashMap<>();
  try (BufferedReader reader = Files.newBufferedReader(path)) {
    String line;
    while ((line = reader.readLine()) != null) {
      int separator = line.indexOf('=');
      if (line.isBlank() || line.startsWith("#") || separator < 0) {
        continue;
      }
      String key = line.substring(0, separator).trim();
      properties.put(key, line.substring(separator + 1).trim());
    }
  }
  return properties;
}
