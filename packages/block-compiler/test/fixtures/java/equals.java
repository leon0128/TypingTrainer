@Override
public boolean equals(Object other) {
  if (this == other) {
    return true;
  }
  if (!(other instanceof Point that)) {
    return false;
  }
  return x == that.x && y == that.y;
}
