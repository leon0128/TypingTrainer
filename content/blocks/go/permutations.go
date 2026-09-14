func permutations(items []string) [][]string {
	if len(items) <= 1 {
		return [][]string{slices.Clone(items)}
	}
	var result [][]string
	for i, head := range items {
		rest := slices.Concat(items[:i], items[i+1:])
		for _, tail := range permutations(rest) {
			result = append(result, append([]string{head}, tail...))
		}
	}
	return result
}
