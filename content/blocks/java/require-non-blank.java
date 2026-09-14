static String requireNonBlank(String value, String name) {
  Objects.requireNonNull(name, "name");
  if (value == null || value.isBlank()) {
    throw new IllegalArgumentException(name + " must not be blank");
  }
  return value.strip();
}
