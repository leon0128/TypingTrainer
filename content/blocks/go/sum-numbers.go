func sum[T interface{ ~int | ~int64 | ~float64 }](values ...T) T {
	var total T
	for _, value := range values {
		total += value
	}
	return total
}
