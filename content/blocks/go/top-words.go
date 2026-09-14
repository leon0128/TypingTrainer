func topWords(counts map[string]int, k int) []string {
	words := slices.Collect(maps.Keys(counts))
	slices.SortFunc(words, func(a, b string) int {
		if c := cmp.Compare(counts[b], counts[a]); c != 0 {
			return c
		}
		return strings.Compare(a, b)
	})
	if len(words) > k {
		words = words[:k]
	}
	return words
}
