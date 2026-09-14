static void rotateRight(int[] values, int steps) {
  int n = values.length;
  if (n == 0) {
    return;
  }
  steps = Math.floorMod(steps, n);
  int[] copy = values.clone();
  for (int i = 0; i < n; i++) {
    values[(i + steps) % n] = copy[i];
  }
}
