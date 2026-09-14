static List<String> splitCsvLine(String line) {
  List<String> fields = new ArrayList<>();
  StringBuilder field = new StringBuilder();
  boolean quoted = false;
  for (int i = 0; i < line.length(); i++) {
    char c = line.charAt(i);
    if (c == '"') {
      quoted = !quoted;
    } else if (c == ',' && !quoted) {
      fields.add(field.toString());
      field.setLength(0);
    } else {
      field.append(c);
    }
  }
  fields.add(field.toString());
  return fields;
}
