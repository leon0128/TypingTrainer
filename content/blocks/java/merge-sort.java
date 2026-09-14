static int[] mergeSort(int[] values) {
  if (values.length < 2) {
    return values;
  }
  int middle = values.length / 2;
  int[] left = mergeSort(Arrays.copyOfRange(values, 0, middle));
  int[] right = mergeSort(Arrays.copyOfRange(values, middle, values.length));
  int[] merged = new int[values.length];
  int i = 0, j = 0, k = 0;
  while (i < left.length && j < right.length) {
    merged[k++] = left[i] <= right[j] ? left[i++] : right[j++];
  }
  while (i < left.length) {
    merged[k++] = left[i++];
  }
  while (j < right.length) {
    merged[k++] = right[j++];
  }
  return merged;
}
