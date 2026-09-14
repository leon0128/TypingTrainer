static List<List<Integer>> pascalTriangle(int rows) {
  List<List<Integer>> triangle = new ArrayList<>();
  for (int r = 0; r < rows; r++) {
    List<Integer> row = new ArrayList<>(r + 1);
    for (int c = 0; c <= r; c++) {
      if (c == 0 || c == r) {
        row.add(1);
      } else {
        List<Integer> above = triangle.get(r - 1);
        row.add(above.get(c - 1) + above.get(c));
      }
    }
    triangle.add(row);
  }
  return triangle;
}
