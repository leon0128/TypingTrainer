func binarySearch[T cmp.Ordered](sorted []T, target T) (int, bool) {
	low, high := 0, len(sorted)
	for low < high {
		mid := low + (high-low)/2
		switch {
		case sorted[mid] < target:
			low = mid + 1
		case sorted[mid] > target:
			high = mid
		default:
			return mid, true
		}
	}
	return low, false
}
