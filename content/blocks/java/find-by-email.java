static Optional<String> findDisplayName(Map<String, String> names, String email) {
  return Optional.ofNullable(email)
      .map(String::strip)
      .map(String::toLowerCase)
      .map(names::get)
      .filter(name -> !name.isBlank());
}
