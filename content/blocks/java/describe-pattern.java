static String describe(Object value) {
  return switch (value) {
    case null -> "null";
    case Integer i when i < 0 -> "negative integer " + i;
    case Integer i -> "integer " + i;
    case String s when s.isEmpty() -> "empty string";
    case String s -> "string of length " + s.length();
    case List<?> list -> "list with " + list.size() + " items";
    default -> "unknown " + value.getClass().getSimpleName();
  };
}
