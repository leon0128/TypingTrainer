static List<String> cheapestPerCategory(List<String> rows) {
  record Item(String category, String name, int price) {}
  return rows.stream()
      .map(row -> row.split(","))
      .map(f -> new Item(f[0], f[1], Integer.parseInt(f[2])))
      .collect(
          Collectors.groupingBy(
              Item::category, Collectors.minBy(Comparator.comparingInt(Item::price))))
      .values()
      .stream()
      .flatMap(Optional::stream)
      .map(item -> item.category() + ": " + item.name())
      .sorted()
      .toList();
}
