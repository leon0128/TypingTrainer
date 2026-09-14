record Point(double x, double y) {
  Point {
    if (!Double.isFinite(x)) {
      throw new IllegalArgumentException("x must be finite: " + x);
    }
    if (!Double.isFinite(y)) {
      throw new IllegalArgumentException("y must be finite: " + y);
    }
  }
}
