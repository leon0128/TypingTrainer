func chunk[S ~[]E, E any](items S, size int) []S {
	if size <= 0 {
		panic("chunk size must be positive")
	}
	chunks := make([]S, 0, (len(items)+size-1)/size)
	for size < len(items) {
		items, chunks = items[size:], append(chunks, items[:size:size])
	}
	return append(chunks, items)
}
