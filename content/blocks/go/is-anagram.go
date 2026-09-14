func isAnagram(first, second string) bool {
	if len(first) != len(second) {
		return false
	}
	counts := make(map[rune]int)
	for _, r := range first {
		counts[r]++
	}
	for _, r := range second {
		counts[r]--
		if counts[r] < 0 {
			return false
		}
	}
	return true
}
