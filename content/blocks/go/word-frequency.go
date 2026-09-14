func wordFrequency(text string) map[string]int {
	counts := make(map[string]int)
	for _, word := range strings.Fields(text) {
		word = strings.ToLower(strings.Trim(word, ".,!?"))
		if word == "" {
			continue
		}
		counts[word]++
	}
	return counts
}
