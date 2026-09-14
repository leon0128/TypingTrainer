func quickSort(values []int) []int {
	if len(values) < 2 {
		return values
	}
	pivot := values[len(values)/2]
	var less, equal, greater []int
	for _, v := range values {
		switch {
		case v < pivot:
			less = append(less, v)
		case v > pivot:
			greater = append(greater, v)
		default:
			equal = append(equal, v)
		}
	}
	result := append(quickSort(less), equal...)
	return append(result, quickSort(greater)...)
}
